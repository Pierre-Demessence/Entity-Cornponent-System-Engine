import type { Sample } from './readme-samples';

/**
 * Type-checks every runnable module-README example against the engine's real
 * declarations, so a defective example (wrong arity, a member that does not
 * exist, a mistyped `@pierre/ecs` import path) fails `npm test` naming the
 * README and the line within it.
 *
 * Only *runnable* blocks are checked — those importing `@pierre/ecs` (see
 * `isRunnable`). They bring their own real types through those imports, so the
 * symbols under test are checked against the genuine declarations. Signature
 * listings and cheat-sheets are API reference, not code; the harness reports how
 * many it skipped rather than forcing a compiler onto them.
 *
 * An example is still a fragment: it freely mentions game-specific identifiers
 * it never defines (`ctx`, `agents`, `GRAVITY`). Checking it verbatim would
 * drown in `Cannot find name` noise and — worse — the checker would type those
 * names as the error type and *suppress* the member errors we want. So each
 * example is checked in two passes:
 *
 *  1. Probe the raw example and collect every `Cannot find name` identifier.
 *  2. Re-check with a prelude that declares each. `world` and `scheduler` get
 *     their real engine types (so `world.scheduleSystem(...)` is a genuine
 *     error, not swallowed); every other unknown becomes an `any` value and
 *     type, harmless in both positions. Names the example imports or declares
 *     itself never appear as unknowns, so the prelude never shadows them.
 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { isRunnable, moduleSamples, SAMPLE_EXCLUSIONS } from './readme-samples';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/** Forward-slashed so the overlay keys match TypeScript's internal paths. */
function samplePath(sample: Sample): string {
  return join(ROOT, '__readme_samples__', `${sample.module}.${sample.index}.ts`)
    .replace(/\\/g, '/');
}

function compilerOptions(): ts.CompilerOptions {
  const config = ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  return {
    ...parsed.options,
    noEmit: true,
    // Samples routinely bind a value to show a call and never read it; that is
    // documentation, not a defect. Only real API misuse should fail.
    noUnusedLocals: false,
    noUnusedParameters: false,
  };
}

/**
 * A program whose root files are served from `overlay` (virtual sample files
 * under the repo root, so `@pierre/ecs` resolves through the node_modules
 * junction) while everything else is read from disk.
 */
function overlayProgram(overlay: Map<string, string>, options: ts.CompilerOptions): ts.Program {
  const host = ts.createCompilerHost(options, true);
  const getSourceFile = host.getSourceFile.bind(host);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
    const text = overlay.get(fileName.replace(/\\/g, '/'));
    return text === undefined
      ? getSourceFile(fileName, languageVersion, onError, shouldCreate)
      : ts.createSourceFile(fileName, text, languageVersion, true);
  };
  host.readFile = fileName => overlay.get(fileName.replace(/\\/g, '/')) ?? readFile(fileName);
  host.fileExists = fileName => overlay.has(fileName.replace(/\\/g, '/')) || fileExists(fileName);
  return ts.createProgram({ host, options, rootNames: [...overlay.keys()] });
}

const CANNOT_FIND_NAME = /Cannot find name '([^']+)'/;
const SHORTHAND_PROPERTY = /shorthand property '([^']+)'/;

/** Identifiers an example references but never defines, per example file path. */
function probeUnknownNames(samples: Sample[], options: ts.CompilerOptions): Map<string, Set<string>> {
  const overlay = new Map(samples.map(s => [samplePath(s), s.code]));
  const program = overlayProgram(overlay, options);
  const unknowns = new Map<string, Set<string>>();
  for (const sample of samples) {
    const path = samplePath(sample);
    const sf = program.getSourceFile(path);
    const names = new Set<string>();
    if (sf) {
      for (const diag of program.getSemanticDiagnostics(sf)) {
        const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
        // 2304/2552: a free identifier. 18004: a `{ x }` shorthand whose value
        // is undefined — same fragment gap, so stub it the same way.
        const match = diag.code === 18004
          ? SHORTHAND_PROPERTY.exec(message)
          : (diag.code === 2304 || diag.code === 2552) ? CANNOT_FIND_NAME.exec(message) : null;
        if (match)
          names.add(match[1]);
      }
    }
    unknowns.set(path, names);
  }
  return unknowns;
}

/** The declarations that make an example's undefined identifiers checkable. */
function preludeFor(names: Set<string>): string[] {
  const lines: string[] = [];
  for (const name of names) {
    if (name === 'world')
      lines.push(`declare const world: import('@pierre/ecs/world').EcsWorld;`);
    else if (name === 'scheduler')
      lines.push(`declare const scheduler: import('@pierre/ecs/scheduler').Scheduler<any>;`);
    else
      // A game-specific identifier the example never defines: harmless in both a
      // value and a (possibly generic) type position. The four type parameters
      // cover every generic arity a sample pseudo-identifier is seen with; a
      // fifth would surface as a real diagnostic, which is acceptable.
      lines.push(`declare const ${name}: any;`, `type ${name}<A = any, B = any, C = any, D = any> = any;`);
  }
  return lines;
}

interface Prepared {
  offset: number;
  path: string;
  sample: Sample;
}

/** A diagnostic promoted to a README location, or `undefined` when ignorable. */
function reportable(diag: ts.Diagnostic, prepared: Prepared): string | undefined {
  if (diag.start === undefined || !diag.file)
    return undefined;
  // An un-annotated parameter whose contextual type was lost to a stubbed host
  // (`canvas.addEventListener((ev) => ...)`) is a sample-lint signal, not misuse
  // of the engine API — the mission is API correctness, not sample strictness.
  if (diag.code === 7006)
    return undefined;
  // A missing third-party module is not an engine-API defect; a mistyped
  // `@pierre/ecs` subpath is.
  if (diag.code === 2307) {
    const message = ts.flattenDiagnosticMessageText(diag.messageText, '\n');
    if (!/Cannot find module '@pierre\/ecs/.test(message))
      return undefined;
  }
  // Map the diagnostic back to the README: `line` is 0-based in the assembled
  // file, `offset` drops the prepended prelude, and `startLine` is the 1-based
  // README line of the block's first code line.
  const { line } = diag.file.getLineAndCharacterOfPosition(diag.start);
  const readmeLine = prepared.sample.startLine + (line - prepared.offset);
  const message = ts.flattenDiagnosticMessageText(diag.messageText, ' ');
  return `${prepared.sample.readmeRel}:${readmeLine} — TS${diag.code}: ${message}`;
}

function checkSamples(samples: Sample[]): Map<string, string[]> {
  const options = compilerOptions();
  const unknowns = probeUnknownNames(samples, options);

  const overlay = new Map<string, string>();
  const prepared: Prepared[] = [];
  for (const sample of samples) {
    const path = samplePath(sample);
    const prelude = preludeFor(unknowns.get(path) ?? new Set());
    const code = prelude.length > 0 ? `${prelude.join('\n')}\n${sample.code}` : sample.code;
    overlay.set(path, code);
    prepared.push({ offset: prelude.length, path, sample });
  }

  const program = overlayProgram(overlay, options);
  const failures = new Map<string, string[]>();
  for (const item of prepared) {
    const sf = program.getSourceFile(item.path);
    const messages: string[] = [];
    if (sf) {
      const diagnostics = [
        ...program.getSyntacticDiagnostics(sf),
        ...program.getSemanticDiagnostics(sf),
      ];
      for (const diag of diagnostics) {
        const message = reportable(diag, item);
        if (message !== undefined)
          messages.push(message);
      }
    }
    failures.set(`${item.sample.readmeRel}#${item.sample.index}`, messages);
  }
  return failures;
}

const allSamples = moduleSamples();
const excludedKeys = new Set(SAMPLE_EXCLUSIONS.map(e => `${e.module}#${e.index}`));
const runnable = allSamples.filter(s => isRunnable(s.code) && !excludedKeys.has(`${s.module}#${s.index}`));
const skipped = allSamples.filter(s => !isRunnable(s.code));
const failures = checkSamples(runnable);

describe('module README samples type-check against the real API', () => {
  it.each(runnable.map(s => ({ key: `${s.readmeRel}#${s.index}`, sample: s })))(
    '$key compiles',
    ({ key }) => {
      expect(failures.get(key) ?? []).toEqual([]);
    },
  );

  it('checks the runnable examples and reports what it skips', () => {
    // Visibility, not a silent skip: reference/cheat-sheet blocks are API docs,
    // not code, and are covered by the symbol-existence linter follow-up.
    console.info(
      `README samples: ${runnable.length} runnable examples checked, `
      + `${skipped.length} reference blocks skipped, `
      + `${SAMPLE_EXCLUSIONS.length} runnable examples excluded.`,
    );
    expect(runnable.length).toBeGreaterThan(0);
  });

  it('excludes only runnable examples with a stated reason', () => {
    for (const exclusion of SAMPLE_EXCLUSIONS)
      expect(exclusion.reason.trim().length).toBeGreaterThan(0);
  });
});
