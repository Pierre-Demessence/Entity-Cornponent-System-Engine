import type { UsageReport } from './engine-usage';

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import { readEntries } from './engine-surface';
import {
  buildUsageReport,
  classifyConsumer,
  declarationNameNodes,
  ENGINE_USAGE_DOC,
  ENGINE_USAGE_JSON_DOC,
  isImported,
  isPlumbing,
  isSelfConsumption,
  isTypePosition,
  referenceMode,
  renderUsageJson,
  renderUsageMarkdown,
} from './engine-usage';

const root = resolve(fileURLToPath(import.meta.url), '../..');

// Normalize line endings: git autocrlf may check files out as CRLF while the
// generators always emit LF, which must not fail a drift comparison.
const normalize = (text: string): string => text.replace(/\r\n/g, '\n');

const committed = (doc: string): string => readFileSync(join(root, doc), 'utf8');

/** Every identifier with this text in a parsed source. */
function identifiersIn(source: ts.SourceFile, name: string): ts.Identifier[] {
  const found: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name)
      found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Parse a snippet and hand back its first identifier with this text. */
function identifierIn(sourceText: string, name: string): ts.Identifier {
  const source = ts.createSourceFile('snippet.ts', sourceText, ts.ScriptTarget.ESNext, true);
  const [first] = identifiersIn(source, name);
  if (!first)
    throw new Error(`no identifier named ${name} in snippet`);
  return first;
}

describe('engine usage report', () => {
  let report: UsageReport;
  beforeAll(() => {
    report = buildUsageReport();
  }, 30_000);

  it('markdown is in sync with the source (run `npm run docs:usage` if this fails)', () => {
    expect(normalize(renderUsageMarkdown(report))).toBe(normalize(committed(ENGINE_USAGE_DOC)));
  });

  it('json is in sync with the source (run `npm run docs:usage` if this fails)', () => {
    expect(normalize(renderUsageJson(report))).toBe(normalize(committed(ENGINE_USAGE_JSON_DOC)));
  });

  it('renders the markdown from the committed json, so the two cannot drift apart', () => {
    const fromJson = JSON.parse(committed(ENGINE_USAGE_JSON_DOC)) as UsageReport;
    expect(normalize(renderUsageMarkdown(fromJson))).toBe(normalize(committed(ENGINE_USAGE_DOC)));
  });

  it('keeps the model JSON-round-trippable', () => {
    // A Set or Map creeping into the model would serialize to `{}` and break
    // both the JSON contract and the HTML lens.
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('covers every public entry of the exports map', () => {
    const expected = readEntries().map(entry => entry.importPath).sort();
    expect(report.entries.map(entry => entry.importPath).sort()).toEqual(expected);
  });
});

describe('classifyConsumer', () => {
  const at = (...segments: string[]): string => join(root, ...segments);

  it('credits an example package by name', () => {
    expect(classifyConsumer(at('examples/snake/src/systems/input.ts'))).toEqual({
      bucket: 'example',
      label: 'snake',
    });
  });

  it('ignores the hub (it renders every other example) and non-source files', () => {
    expect(classifyConsumer(at('examples/hub/src/main.ts'))).toBeUndefined();
    expect(classifyConsumer(at('examples/snake/vite.config.ts'))).toBeUndefined();
    expect(classifyConsumer(at('examples/snake/dist/assets/index.js'))).toBeUndefined();
    expect(classifyConsumer(at('scripts/engine-usage.ts'))).toBeUndefined();
  });

  it('separates tests, modules and core files', () => {
    expect(classifyConsumer(at('src/modules/timer/timer.test.ts'))).toEqual({
      bucket: 'test',
      label: 'src/modules/timer/timer.test.ts',
    });
    expect(classifyConsumer(at('src/modules/timer/timer.ts'))).toEqual({
      bucket: 'other',
      label: 'timer',
    });
    expect(classifyConsumer(at('src/world.ts'))).toEqual({ bucket: 'other', label: 'world.ts' });
  });
});

describe('referenceMode', () => {
  it('reads the type-only markers of an import', () => {
    expect(referenceMode(identifierIn('import { X } from "m";', 'X'))).toBe('value');
    expect(referenceMode(identifierIn('import type { X } from "m";', 'X'))).toBe('type');
    expect(referenceMode(identifierIn('import { type X } from "m";', 'X'))).toBe('type');
  });
});

describe('isTypePosition', () => {
  it.each([
    ['annotation', 'const a: X = 1;'],
    ['return type', 'function f(): X { return 1 as never; }'],
    ['type argument', 'const list: Array<X> = [];'],
    ['heritage clause', 'class C implements X {}'],
    ['type alias body', 'type T = X;'],
    ['typeof query', 'type T = typeof X;'],
  ])('treats a %s reference as a type position', (_label, sourceText) => {
    expect(isTypePosition(identifierIn(sourceText, 'X'))).toBe(true);
  });

  it.each([
    ['call argument', 'const v = f(X);'],
    ['construction', 'const v = new X();'],
    ['member access', 'const v = X.member;'],
    ['property value', 'const v = { key: X };'],
    ['default import binding', 'import X from "m";'],
    // `typeof X` in expression position is the JS operator, not a type query.
    ['expression typeof', 'const v = typeof X;'],
  ])('treats a %s reference as a value position', (_label, sourceText) => {
    expect(isTypePosition(identifierIn(sourceText, 'X'))).toBe(false);
  });
});

describe('reference exclusions', () => {
  it('treats a re-export as plumbing but a value that uses the symbol as real', () => {
    expect(isPlumbing(identifierIn('export { X } from "m";', 'X'))).toBe(true);
    expect(isPlumbing(identifierIn('export type { X } from "m";', 'X'))).toBe(true);
    expect(isPlumbing(identifierIn('export const y = X;', 'X'))).toBe(false);
    expect(isPlumbing(identifierIn('const v = f(X);', 'X'))).toBe(false);
  });

  it('flags only the import clause, so a barrel can be excluded without losing a use', () => {
    const source = ts.createSourceFile(
      'snippet.ts',
      'import { X } from "m";\nconst v = X;',
      ts.ScriptTarget.ESNext,
      true,
    );
    const [imported, used] = identifiersIn(source, 'X');
    expect(isImported(imported)).toBe(true);
    expect(isImported(used)).toBe(false);
  });

  it('counts self-consumption, with a module\'s own tests as the exception', () => {
    const moduleDir = 'src/modules/timer/';
    const declaration = 'src/modules/timer/timer.ts';
    expect(isSelfConsumption(declaration, moduleDir, declaration)).toBe(true);
    expect(isSelfConsumption('src/modules/timer/helpers.ts', moduleDir, declaration)).toBe(true);
    expect(isSelfConsumption('src/modules/timer/timer.test.ts', moduleDir, declaration)).toBe(false);
    expect(isSelfConsumption('examples/snake/src/main.ts', moduleDir, declaration)).toBe(false);
    expect(isSelfConsumption('src/scheduler.ts', moduleDir, declaration)).toBe(false);
    // A core symbol's own declaration file is self-consumption; another file is not.
    expect(isSelfConsumption('src/world.ts', undefined, 'src/world.ts')).toBe(true);
    expect(isSelfConsumption('src/scheduler.ts', undefined, 'src/world.ts')).toBe(false);
  });

  it('collects a symbol\'s own name nodes, not its call sites', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecs-usage-'));
    const file = join(dir, 'snippet.ts');
    writeFileSync(file, 'export function foo(): void {}\nfoo();\n', 'utf8');
    try {
      const program = ts.createProgram([file], { target: ts.ScriptTarget.ESNext });
      const source = program.getSourceFile(file);
      if (!source)
        throw new Error('snippet missing from program');
      const [declared, called] = identifiersIn(source, 'foo');
      const symbol = program.getTypeChecker().getSymbolAtLocation(declared);
      if (!symbol)
        throw new Error('no symbol for foo');
      const names = declarationNameNodes(symbol);
      expect(names.has(declared)).toBe(true);
      expect(names.has(called)).toBe(false);
    }
    finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
