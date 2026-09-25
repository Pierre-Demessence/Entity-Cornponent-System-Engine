import type { Entry, SymbolKind } from './engine-surface';

/**
 * Generates the engine usage report: for every public export, which files
 * reference it, bucketed by consumer kind — an example package, a unit test, or
 * other engine source. The inverse view of `engine-api.ts`: that catalog says
 * what exists, this says what is used.
 *
 * Analysis and rendering are separate: `buildUsageReport()` returns a plain
 * JSON-able model, which three renderers turn into the committed markdown, the
 * committed JSON contract, and a generated HTML lens (not committed — see
 * `.gitignore`).
 *
 * Pure: writes nothing. The CLI wrapper (`engine-usage.gen.ts`) writes the
 * files; the drift test (`engine-usage.test.ts`) compares each committed file
 * against a fresh generation.
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import ts from 'typescript';

import {
  compareNames,
  isValueKind,
  publicSymbolsOf,
  readEntries,
  resolveAlias,
  ROOT,
} from './engine-surface';

/** Repo-relative paths of the generated artifacts. */
export const ENGINE_USAGE_DOC = 'docs/agent/engine-usage.md';
export const ENGINE_USAGE_JSON_DOC = 'docs/agent/engine-usage.json';
/** Generated and gitignored: a local lens over the JSON, not a versioned artifact. */
export const ENGINE_USAGE_HTML_DOC = 'docs/agent/engine-usage.html';

/**
 * `examples/hub` renders every other example, so counting it would credit all
 * modules to one consumer; `examples/assets` holds art rather than source.
 */
const EXCLUDED_EXAMPLES = new Set(['hub', 'assets']);

/** Per-line cap on listed consumers. */
const MAX_LISTED = 8;

type Bucket = 'example' | 'test' | 'other';

/** Live accumulator for one bucket; its serializable form is `BucketUsage`. */
interface MutableBucket {
  consumers: Set<string>;
  type: boolean;
  value: boolean;
}

/** The three live buckets collected for one symbol, before serialization. */
interface Usage {
  example: MutableBucket;
  other: MutableBucket;
  test: MutableBucket;
}

interface Target {
  name: string;
  /** Path key of the symbol's own declaration file. */
  declarationFile: string;
  /** Identifier nodes that *declare* this symbol — not references to it. */
  declarationNames: Set<ts.Node>;
  entry: Entry;
  kind: SymbolKind;
  /** `src/modules/<name>/` key for a module export; absent for core symbols. */
  moduleDir?: string;
  symbol: ts.Symbol;
  usage: Usage;
}

interface Consumer {
  bucket: Bucket;
  label: string;
}

/*
 * The serializable model. Everything from here to `buildUsageReport()` is plain
 * JSON-able data — arrays, never `Set`/`Map`, every list already sorted — so the
 * JSON artifact is byte-stable and the markdown and HTML renderers cannot
 * disagree about what the data means.
 */

/** One consumer bucket in the model: who references a symbol, and how. */
export interface BucketUsage {
  /** Consumer labels, sorted. */
  consumers: string[];
  /** For a value symbol: every reference in this bucket is in type position. */
  typeOnly: boolean;
}

export interface SymbolUsage {
  name: string;
  /** A value symbol needs a value-position example reference to count. */
  coveredByExample: boolean;
  example: BucketUsage;
  isValue: boolean;
  kind: SymbolKind;
  /** Nothing outside the symbol's own source references it. */
  noExternalConsumer: boolean;
  other: BucketUsage;
  test: BucketUsage;
}

export interface EntryUsage {
  coveredByExample: boolean;
  /** Unions across the entry's symbols, sorted. */
  examples: string[];
  importPath: string;
  isModule: boolean;
  other: string[];
  symbols: SymbolUsage[];
  tests: string[];
  typeTotal: number;
  typeUsedByExample: number;
  valueTotal: number;
  valueUsedByExample: number;
}

export interface ExampleUsage {
  name: string;
  entries: number;
  type: number;
  value: number;
}

export interface CandidateUsage {
  importPath: string;
  missing: number;
  total: number;
}

export interface UsageReport {
  /** Modules ranked by unreferenced value exports. */
  candidates: CandidateUsage[];
  /** Sorted by import path. */
  entries: EntryUsage[];
  /** Sorted by reach, then name. */
  examples: ExampleUsage[];
  headline: {
    entries: number;
    coreEntries: number;
    modules: number;
    symbols: number;
    valueSymbols: number;
    typeSymbols: number;
    entriesWithExample: number;
    entriesWithoutExample: number;
    valueWithoutExample: number;
    valueWithNoConsumer: number;
    noExternalConsumer: number;
  };
}

/**
 * Paths are compared through this key, not raw strings: the compiler reports
 * `/`-separated names while `node:path` produces `\` on Windows, and the two
 * disagree on drive-letter case.
 */
function pathKey(file: string): string {
  return file.replaceAll('\\', '/').toLowerCase();
}

const ROOT_KEY = pathKey(ROOT);

/** Lower-case repo-relative path of a file inside the repo. */
function repoPath(file: string): string {
  const key = pathKey(file);
  return key.startsWith(`${ROOT_KEY}/`) ? key.slice(ROOT_KEY.length + 1) : key;
}

function walkTs(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory())
      walkTs(full, out);
    else if (entry.name.endsWith('.ts'))
      out.push(full);
  }
}

/** Every TypeScript file under `examples/<name>/src`, minus excluded packages. */
function listExampleSources(): string[] {
  const examplesDir = join(ROOT, 'examples');
  const files: string[] = [];
  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || EXCLUDED_EXAMPLES.has(entry.name))
      continue;
    const src = join(examplesDir, entry.name, 'src');
    if (existsSync(src))
      walkTs(src, files);
  }
  return files;
}

/**
 * Root options cover both trees: `moduleResolution: bundler` +
 * `allowImportingTsExtensions` resolve the package's `.ts` export targets, and
 * `@pierre/ecs` unifies with `src/` through the workspace `file:` link
 * (`preserveSymlinks` is off). Diagnostics are never read — unresolved
 * third-party imports (`three`) must not fail generation.
 */
function createUsageProgram(): ts.Program {
  const config = ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  return ts.createProgram({
    options: parsed.options,
    rootNames: [...parsed.fileNames, ...listExampleSources()],
  });
}

/** Where a file sits decides how its references are credited, if at all. */
export function classifyConsumer(file: string): Consumer | undefined {
  const rel = repoPath(file);
  if (rel.startsWith('examples/')) {
    const name = rel.split('/')[1];
    if (!name || EXCLUDED_EXAMPLES.has(name) || !rel.startsWith(`examples/${name}/src/`))
      return undefined;
    return { bucket: 'example', label: name };
  }
  if (!rel.startsWith('src/'))
    return undefined;
  if (rel.endsWith('.test.ts'))
    return { bucket: 'test', label: rel };
  return { bucket: 'other', label: sourceLabel(rel) };
}

/** Modules are named by directory; core files by filename — both unique. */
function sourceLabel(rel: string): string {
  const module = /^src\/modules\/([^/]+)\//.exec(rel);
  return module ? module[1] : basename(rel);
}

function enclosing(node: ts.Node, matches: (n: ts.Node) => boolean): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (matches(n))
      return true;
  }
  return false;
}

/**
 * `export { X } from '…'` names a symbol without consuming it: plumbing, and
 * the only reference an aggregating barrel holds.
 */
export function isPlumbing(node: ts.Node): boolean {
  return enclosing(node, ts.isExportDeclaration);
}

export function isImported(node: ts.Node): boolean {
  return enclosing(node, ts.isImportDeclaration);
}

/**
 * Self-consumption proves nothing about an exported surface: a module's own
 * directory is skipped, and so is the symbol's own declaration file — except a
 * module's own `*.test.ts`, which is that module's primary evidence.
 */
export function isSelfConsumption(
  fileKey: string,
  moduleDir: string | undefined,
  declarationFile: string,
): boolean {
  if (fileKey === declarationFile)
    return true;
  return moduleDir !== undefined && fileKey.startsWith(moduleDir) && !fileKey.endsWith('.test.ts');
}

function importSpecifierOf(node: ts.Node): ts.ImportSpecifier | undefined {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isImportSpecifier(n))
      return n;
    if (ts.isImportDeclaration(n) || ts.isStatement(n))
      return undefined;
  }
  return undefined;
}

/**
 * A reference is type-position when it only ever feeds the type system:
 * annotations, type arguments, heritage clauses, `typeof` queries. Anything
 * reaching a statement boundary without crossing a type node is a value use.
 */
export function isTypePosition(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isTypeNode(n) || ts.isTypeParameterDeclaration(n) || ts.isHeritageClause(n))
      return true;
    if (ts.isStatement(n) || ts.isSourceFile(n) || ts.isImportDeclaration(n) || ts.isExportDeclaration(n))
      return false;
  }
  return false;
}

type Mode = 'value' | 'type';

export function referenceMode(node: ts.Node): Mode {
  const specifier = importSpecifierOf(node);
  if (specifier) {
    // `import type { X }` marks the clause; `import { type X }` marks the specifier.
    const clause = specifier.parent.parent;
    return specifier.isTypeOnly || clause.isTypeOnly ? 'type' : 'value';
  }
  return isTypePosition(node) ? 'type' : 'value';
}

/** Identifier nodes that declare the symbol, so its own name is not a use. */
export function declarationNameNodes(symbol: ts.Symbol): Set<ts.Node> {
  const names = new Set<ts.Node>();
  for (const declaration of symbol.getDeclarations() ?? []) {
    const name = ts.getNameOfDeclaration(declaration);
    if (name)
      names.add(name);
  }
  return names;
}

/** Module `index.ts` files and the aggregate root are pure re-export barrels. */
function barrelFiles(entries: Entry[]): Set<string> {
  const barrels = new Set(entries.filter(e => e.isModule).map(e => pathKey(e.file)));
  barrels.add(pathKey(join(ROOT, 'src/index.ts')));
  return barrels;
}

function emptyBucket(): MutableBucket {
  return { consumers: new Set(), type: false, value: false };
}

function emptyUsage(): Usage {
  return { example: emptyBucket(), other: emptyBucket(), test: emptyBucket() };
}

function buildTargets(program: ts.Program, checker: ts.TypeChecker, entries: Entry[]): Target[] {
  const targets: Target[] = [];
  for (const entry of entries) {
    for (const symbol of publicSymbolsOf(program, checker, entry)) {
      targets.push({
        name: symbol.name,
        declarationFile: pathKey(symbol.declarationFile),
        declarationNames: declarationNameNodes(symbol.symbol),
        entry,
        kind: symbol.kind,
        moduleDir: entry.isModule ? `${pathKey(dirname(entry.file))}/` : undefined,
        symbol: symbol.symbol,
        usage: emptyUsage(),
      });
    }
  }
  return targets;
}

/**
 * One AST pass over every file that can count as a consumer. Identifiers are
 * prefiltered by name before the (expensive) symbol lookup, so only plausible
 * hits reach the checker.
 */
function collectReferences(program: ts.Program, targets: Target[]): Map<string, number> {
  const checker = program.getTypeChecker();
  const byName = new Map<string, Target[]>();
  for (const target of targets) {
    const list = byName.get(target.name);
    if (list)
      list.push(target);
    else
      byName.set(target.name, [target]);
  }

  const barrels = barrelFiles(readEntries());
  const resolvedByFile = new Map<string, number>();

  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile)
      continue;
    const consumer = classifyConsumer(source.fileName);
    if (!consumer)
      continue;
    const file = source.fileName;
    const key = pathKey(file);
    const isBarrel = barrels.has(key);

    const record = (node: ts.Identifier): void => {
      const candidates = byName.get(node.text);
      if (!candidates)
        return;
      const symbol = checker.getSymbolAtLocation(node);
      if (!symbol)
        return;
      const canonical = resolveAlias(symbol, checker);
      for (const target of candidates) {
        if (target.symbol !== canonical)
          continue;
        // Resolution proof, counted before the exclusions below — a file that
        // imports the engine must resolve at least one symbol (see self-check).
        resolvedByFile.set(file, (resolvedByFile.get(file) ?? 0) + 1);
        if (target.declarationNames.has(node) || isPlumbing(node))
          continue;
        if (isBarrel && isImported(node))
          continue;
        if (isSelfConsumption(key, target.moduleDir, target.declarationFile))
          continue;
        const bucket = target.usage[consumer.bucket];
        bucket.consumers.add(consumer.label);
        if (referenceMode(node) === 'type')
          bucket.type = true;
        else
          bucket.value = true;
      }
    };

    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        record(node);
        return;
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);
  }

  return resolvedByFile;
}

/**
 * Coverage tooling degrades silently when module resolution breaks: an example
 * that cannot see the engine would be reported as using nothing. Any example
 * file that imports `@pierre/ecs` must therefore resolve at least one symbol.
 */
function assertExamplesResolved(program: ts.Program, resolvedByFile: Map<string, number>): void {
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || !repoPath(source.fileName).startsWith('examples/'))
      continue;
    const importsEngine = source.statements.some(
      s => ts.isImportDeclaration(s)
        && ts.isStringLiteral(s.moduleSpecifier)
        && s.moduleSpecifier.text.startsWith('@pierre/ecs'),
    );
    if (importsEngine && !resolvedByFile.get(source.fileName))
      throw new Error(`engine-usage: ${repoPath(source.fileName)} imports @pierre/ecs but no symbol resolved — is the package installed?`);
  }
}

/** A value export needs a value-position reference to count as example-proven. */
function exampleCovered(target: Target): boolean {
  if (target.usage.example.consumers.size === 0)
    return false;
  return isValueKind(target.kind) ? target.usage.example.value : true;
}

/** No consumer outside the symbol's own source (see the header caveat). */
function noExternalConsumer(target: Target): boolean {
  return target.usage.example.consumers.size === 0
    && target.usage.test.consumers.size === 0
    && target.usage.other.consumers.size === 0;
}

function listNames(names: string[]): string {
  if (names.length === 0)
    return '—';
  const head = names.slice(0, MAX_LISTED).join(', ');
  return names.length > MAX_LISTED ? `${head} +${names.length - MAX_LISTED} more` : head;
}

function describeBucket(bucket: BucketUsage, isValue: boolean): string {
  if (bucket.consumers.length === 0)
    return '—';
  const typeOnly = isValue && bucket.typeOnly ? ' (type only)' : '';
  return `${listNames(bucket.consumers)}${typeOnly}`;
}

function unionConsumers(symbols: Target[], bucket: Bucket): string[] {
  const names = new Set<string>();
  for (const symbol of symbols) {
    for (const consumer of symbol.usage[bucket].consumers)
      names.add(consumer);
  }
  return [...names].sort(compareNames);
}

function symbolLine(symbol: SymbolUsage): string {
  const label = `- **\`${symbol.name}\`** _(${symbol.kind})_`;
  if (symbol.noExternalConsumer)
    return `${label} — no external consumer`;
  return `${label} — examples: ${describeBucket(symbol.example, symbol.isValue)}`
    + ` · tests: ${describeBucket(symbol.test, symbol.isValue)}`
    + ` · other: ${describeBucket(symbol.other, symbol.isValue)}`;
}

function entrySummary(entry: EntryUsage): string {
  return `value ${entry.valueUsedByExample}/${entry.valueTotal} · type ${entry.typeUsedByExample}/${entry.typeTotal}`
    + ` · examples: ${listNames(entry.examples)}`
    + ` · tests: ${entry.tests.length || '—'}`
    + ` · other: ${listNames(entry.other)}`;
}

/** Serialize one live bucket: sorted consumers, plus how they referenced it. */
function toBucketUsage(bucket: MutableBucket): BucketUsage {
  return {
    consumers: [...bucket.consumers].sort(compareNames),
    typeOnly: !bucket.value && bucket.type,
  };
}

function toSymbolUsage(target: Target): SymbolUsage {
  return {
    name: target.name,
    coveredByExample: exampleCovered(target),
    example: toBucketUsage(target.usage.example),
    isValue: isValueKind(target.kind),
    kind: target.kind,
    noExternalConsumer: noExternalConsumer(target),
    other: toBucketUsage(target.usage.other),
    test: toBucketUsage(target.usage.test),
  };
}

function toEntryUsage(entry: Entry, symbols: Target[]): EntryUsage {
  const values = symbols.filter(t => isValueKind(t.kind));
  const types = symbols.filter(t => !isValueKind(t.kind));
  return {
    coveredByExample: symbols.some(exampleCovered),
    examples: unionConsumers(symbols, 'example'),
    importPath: entry.importPath,
    isModule: entry.isModule,
    other: unionConsumers(symbols, 'other'),
    symbols: [...symbols].sort((a, b) => compareNames(a.name, b.name)).map(toSymbolUsage),
    tests: unionConsumers(symbols, 'test'),
    typeTotal: types.length,
    typeUsedByExample: types.filter(exampleCovered).length,
    valueTotal: values.length,
    valueUsedByExample: values.filter(exampleCovered).length,
  };
}

function toExampleUsages(targets: Target[]): ExampleUsage[] {
  const seenEntries = new Map<string, Set<string>>();
  const coverage = new Map<string, ExampleUsage>();
  for (const target of targets) {
    for (const name of target.usage.example.consumers) {
      const usage = coverage.get(name) ?? { name, entries: 0, type: 0, value: 0 };
      coverage.set(name, usage);
      const seen = seenEntries.get(name) ?? new Set<string>();
      seenEntries.set(name, seen);
      if (!seen.has(target.entry.importPath)) {
        seen.add(target.entry.importPath);
        usage.entries++;
      }
      if (isValueKind(target.kind) && target.usage.example.value)
        usage.value++;
      else
        usage.type++;
    }
  }
  return [...coverage.values()]
    .sort((a, b) => (b.value + b.type) - (a.value + a.type) || compareNames(a.name, b.name));
}

/** Assemble the serializable model from the collected references. */
function toReport(entries: Entry[], targets: Target[]): UsageReport {
  const byEntry = new Map<Entry, Target[]>();
  for (const target of targets) {
    const list = byEntry.get(target.entry);
    if (list)
      list.push(target);
    else
      byEntry.set(target.entry, [target]);
  }

  const entryUsages = [...entries]
    .sort((a, b) => compareNames(a.importPath, b.importPath))
    .map(entry => toEntryUsage(entry, byEntry.get(entry) ?? []));
  const values = targets.filter(t => isValueKind(t.kind));
  const valueWithoutExample = values.filter(t => !exampleCovered(t));

  return {
    entries: entryUsages,
    examples: toExampleUsages(targets),
    candidates: entryUsages
      .filter(e => e.isModule)
      .map(e => ({ importPath: e.importPath, missing: e.valueTotal - e.valueUsedByExample, total: e.valueTotal }))
      .filter(c => c.missing > 0)
      .sort((a, b) => b.missing - a.missing || compareNames(a.importPath, b.importPath)),
    headline: {
      coreEntries: entryUsages.filter(e => !e.isModule).length,
      entries: entryUsages.length,
      entriesWithExample: entryUsages.filter(e => e.coveredByExample).length,
      entriesWithoutExample: entryUsages.filter(e => !e.coveredByExample).length,
      modules: entryUsages.filter(e => e.isModule).length,
      noExternalConsumer: targets.filter(noExternalConsumer).length,
      symbols: targets.length,
      typeSymbols: targets.length - values.length,
      valueSymbols: values.length,
      valueWithNoConsumer: valueWithoutExample.filter(noExternalConsumer).length,
      valueWithoutExample: valueWithoutExample.length,
    },
  };
}

/**
 * Build the whole report: one compiler program, one AST pass, then the
 * serializable model that every renderer shares.
 */
export function buildUsageReport(): UsageReport {
  const program = createUsageProgram();
  const checker = program.getTypeChecker();
  const entries = readEntries();
  const targets = buildTargets(program, checker, entries);
  assertExamplesResolved(program, collectReferences(program, targets));
  return toReport(entries, targets);
}

/** Build the full markdown report as a deterministic string. */
/** Render the committed markdown. Deterministic: byte-stable across machines. */
export function renderUsageMarkdown(report: UsageReport): string {
  const { headline } = report;
  const entries = report.entries;
  const modules = entries.filter(e => e.isModule);
  const withoutExample = entries.filter(e => !e.coveredByExample);

  const lines: string[] = [
    '<!-- GENERATED by scripts/engine-usage.gen.ts — do not edit by hand. Run `npm run docs:usage`. -->',
    '',
    '# Engine usage report',
    '',
    'What the repo around the engine references out of the engine\'s public',
    'surface: for every export, which `examples/*` packages use it, which only',
    'unit tests touch, which only other engine source touches, and which nothing',
    'references at all. The inverse view of',
    '[engine-api.md](engine-api.md): that catalog says what exists, this says what',
    'is used. Read it when choosing what to build next.',
    '',
    '**References, not exercise.** A symbol counted here appears in source the',
    'compiler resolves to that declaration — not proof the code path ever runs (a',
    'reference on an input-gated branch still counts). Three kinds of reference',
    'are not counted, because none is evidence that a consumer exists: a symbol\'s',
    'own declaration, re-export plumbing (`export { X } from \'…\'`, the only',
    'reference an aggregating barrel holds), and self-consumption — a module\'s own',
    'directory, or a core symbol\'s own declaration file. A module\'s own',
    '`*.test.ts` does count. `no external consumer` therefore means: nothing',
    'outside the symbol\'s own source references it. A type used only implicitly',
    '(through another symbol\'s signature, so its name never appears) is likewise',
    'not counted, and neither are destructured namespace bindings',
    '(`const { f } = ns`).',
    '',
    'Scanned: `examples/*/src/**` (minus `hub`, which renders every other',
    'example, and `assets`, which holds art) and `src/**`. `dist/`,',
    '`node_modules/`, and consumers outside this repo are excluded. Regenerate',
    'with `npm run docs:usage`; a drift test fails `npm test` when this file is',
    'stale.',
    '',
    'Entry sections read `value used/total · type used/total · examples: … ·',
    'tests n · other …`, where "used" means referenced by at least one example — a',
    'value export referenced only from a type position does not count, `examples`',
    'names the example packages that reach the entry, `other` names engine source',
    'outside it (other modules, or core files) and `tests` counts the unit-test',
    'files that reference it. Symbol lines list every consumer;',
    '`no external consumer` means nothing outside the symbol\'s own source',
    'references it.',
    '',
    '---',
    '',
    '## Headline',
    '',
    `- ${headline.entries} public entries (${headline.coreEntries} core, ${headline.modules} modules) · ${headline.symbols} symbols (${headline.valueSymbols} value, ${headline.typeSymbols} type)`,
    `- ${headline.entriesWithExample} entries referenced by at least one example · ${headline.entriesWithoutExample} with none`,
    `- ${headline.valueWithoutExample} value symbols referenced by no example (${headline.valueWithNoConsumer} of them with no external consumer at all)`,
    `- ${headline.noExternalConsumer} symbols with no external consumer`,
    '',
    '## Entries with no example reference',
    '',
    'Nothing under `examples/*` reaches these — check `tests` and `other` before',
    'reading it as unproven: a module can be covered by its unit tests, or used',
    'only by another module.',
    '',
  ];

  if (withoutExample.length === 0) {
    lines.push('None — every entry has an example consumer.', '');
  }
  else {
    for (const entry of withoutExample) {
      lines.push(
        `- \`${entry.importPath}\` — tests: ${entry.tests.length || '—'} · other: ${listNames(entry.other)}`,
      );
    }
    lines.push('');
  }

  lines.push(
    '## Next-example candidates',
    '',
    'Modules ranked by how many of their value exports no example references —',
    'the shortlist for the next game in',
    '[twenty-games-challenge.md](../twenty-games-challenge.md).',
    '',
  );

  if (report.candidates.length === 0) {
    lines.push('None — every module has at least one value export used by an example.', '');
  }
  else {
    for (const candidate of report.candidates)
      lines.push(`- \`${candidate.importPath}\` — ${candidate.missing} of ${candidate.total} value exports unreferenced by any example`);
    lines.push('');
  }

  lines.push(
    '## Coverage by example',
    '',
    'The other direction: how much of the surface each prototype reaches. Entries',
    'counts are distinct import paths; the value/type split counts referenced',
    'symbols.',
    '',
    '| example | entries | value | type |',
    '|---|---|---|---|',
  );
  for (const example of report.examples)
    lines.push(`| ${example.name} | ${example.entries} | ${example.value} | ${example.type} |`);
  if (report.examples.length === 0)
    lines.push('| — | — | — | — |');
  lines.push('');

  const renderGroup = (title: string, group: EntryUsage[]): void => {
    lines.push('---', '', `## ${title}`, '');
    for (const entry of group) {
      lines.push(`### \`${entry.importPath}\``, '', entrySummary(entry), '');
      for (const symbol of entry.symbols)
        lines.push(symbolLine(symbol));
      lines.push('');
    }
  };
  renderGroup('Core primitives', entries.filter(e => !e.isModule));
  renderGroup('Modules', modules);

  return `${lines.join('\n')}\n`;
}

/** Render the committed JSON contract: the model itself, pretty-printed. */
export function renderUsageJson(report: UsageReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Inline JSON without letting a `</script>` sequence escape the script tag. */
function inlineJson(data: unknown): string {
  return JSON.stringify(data).replaceAll('<', '\\u003c');
}

/**
 * Render the HTML lens: one self-contained file with the model inlined (no
 * network, so it opens straight from disk), sortable columns and a filter. It is
 * generated and gitignored — a way to look at the data, not a versioned artifact.
 */
export function renderUsageHtml(report: UsageReport): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Engine usage report</title>
<style>
:root { color-scheme: light dark; --line: #c9c9c9; --full: #1e9e3a; --partial: #e07b00; --none: #d83a3a; --na: #8a9099; }
* { box-sizing: border-box; }
body { margin: 0 auto; padding: 1.5rem; max-width: 1200px; font: 14px/1.55 ui-sans-serif, system-ui, sans-serif; }
h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
h2 { font-size: 1rem; margin: 2rem 0 .5rem; }
.sub { margin: 0 0 1rem; }
code { font-family: ui-monospace, SFMono-Regular, monospace; }
.muted { opacity: .55; }
.stats { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 1rem; padding: 0; list-style: none; }
.stats li { border: 1px solid var(--line); border-radius: .4rem; padding: .3rem .6rem; cursor: help; }
.stats b { font-variant-numeric: tabular-nums; }
.controls { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin-bottom: .75rem; }
input[type='search'] { flex: 1 1 16rem; padding: .35rem .5rem; border: 1px solid var(--line); border-radius: .4rem; background: transparent; color: inherit; }
.controls label { display: flex; gap: .35rem; align-items: center; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: .3rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { cursor: pointer; user-select: none; white-space: nowrap; }
th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
th, td.ellipsis { white-space: nowrap; }
td.ellipsis { max-width: 16rem; overflow: hidden; text-overflow: ellipsis; }
tbody tr.entry { cursor: pointer; }
tbody tr:hover { background: rgba(127, 127, 127, .12); }
tbody tr.symrow > td:first-child { padding-left: 3.2rem; }
tbody tr.symrow td { font-size: 13px; }
tbody tr.r-full { box-shadow: inset 6px 0 0 0 var(--full); }
tbody tr.r-partial { box-shadow: inset 6px 0 0 0 var(--partial); }
tbody tr.r-none { box-shadow: inset 6px 0 0 0 var(--none); }
tbody tr.group { cursor: pointer; font-weight: 600; }
tbody tr.group > td { border-top: 2px solid var(--line); }
tbody tr.entry > td:first-child { padding-left: 1.6rem; }
td.c-full { color: var(--full); font-weight: 600; }
td.c-partial { color: var(--partial); font-weight: 600; }
td.c-none { color: var(--none); font-weight: 600; }
td.c-na { opacity: .6; }
.about { margin: 0 0 1rem; font-size: 13px; }
.about summary { cursor: pointer; font-weight: 600; }
.about p { margin: .5rem 0; }
.defs { margin: .5rem 0; padding-left: 1.2rem; }
.defs li { margin: .25rem 0; }
.meter { position: relative; display: inline-flex; align-items: center; justify-content: flex-end; width: 4.5rem; height: 1.15rem; border: 1px solid var(--line); border-radius: .25rem; overflow: hidden; }
.meter-fill { position: absolute; left: 0; top: 0; bottom: 0; opacity: .4; }
.meter-fill.f-full { background: var(--full); }
.meter-fill.f-partial { background: var(--partial); }
.meter-fill.f-none { background: var(--none); }
.meter-label { position: relative; padding: 0 .35rem; font-size: 12px; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h1>Engine usage report</h1>
<p class="sub">References, not exercise. Generated by <code>npm run docs:usage</code>; the versioned
artifacts are <code>engine-usage.md</code> and <code>engine-usage.json</code>. Click a group to expand
its entries, an entry for its symbols, a header to sort.</p>
<details class="about">
<summary>How to read this</summary>
<ul class="defs">
<li><b>examples</b> — the example packages that reach this entry</li>
<li><b>internal</b> — engine source outside this entry that references it (other modules, or core files)</li>
<li><b>coverage</b> — value exports referenced by at least one example, out of the entry's total (bar + fraction; the row-stripe colour echoes it). Sort ascending for least-covered first.</li>
</ul>
<p>Greyed symbol names in an expanded row have no consumer outside their own source.</p>
</details>
<ul class="stats" id="stats"></ul>
<div class="controls">
<input id="filter" type="search" placeholder="filter entries and symbols">
<label><input id="hide-covered" type="checkbox">hide covered</label>
<label><input id="show-types" type="checkbox">show types</label>
</div>
<table>
<thead><tr id="head"></tr></thead>
<tbody id="rows"></tbody>
</table>
<h2>Coverage by example</h2>
<table>
<thead><tr><th>example</th><th class="num">entries</th><th class="num">value</th><th class="num">type</th></tr></thead>
<tbody id="examples"></tbody>
</table>
<script>
const REPORT = ${inlineJson(report)};
const COLUMNS = [
  { key: 'name', label: 'entry', sort: e => e.importPath, text: e => e.importPath },
  { key: 'examples', label: 'examples', cls: 'num', hint: 'number of example packages that reference this entry (hover for the list)', sort: e => e.examples.length, text: e => e.examples.length || '\u2014', hover: e => e.examples.join(', ') },
  { key: 'other', label: 'internal', cls: 'num', hint: 'number of engine sources outside this entry that reference it (hover for the list)', sort: e => e.other.length, text: e => e.other.length || '\u2014', hover: e => e.other.join(', ') },
  { key: 'coverage', label: 'coverage', cls: 'coverage', hint: 'value-export coverage by examples \u2014 bar and fraction; sort ascending for least-covered first', sort: e => e.valueTotal ? e.valueUsedByExample / e.valueTotal : 1.5, cmp: (a, b, dir) => coverageCompare(a, b, dir), cell: e => coverageCell(e) },
];
const state = { filter: '', hideCovered: false, showTypes: false, sort: 'coverage', dir: 1, open: {}, group: { core: false, modules: false } };

function missing(entry) {
  return entry.valueTotal - entry.valueUsedByExample;
}
function coverageClass(entry) {
  if (!entry.valueTotal) return 'na';
  const used = entry.valueUsedByExample;
  if (used === entry.valueTotal) return 'full';
  return used === 0 ? 'none' : 'partial';
}
function ratioClass(used, total) {
  if (!total) return 'na';
  if (used === total) return 'full';
  return used === 0 ? 'none' : 'partial';
}
function meterCell(used, total, miss) {
  const meter = el('div', undefined, 'meter');
  meter.title = total ? (used + ' of ' + total + ' referenced by an example' + (miss ? ' \u00B7 ' + miss + ' missing' : '')) : 'no value exports to measure';
  if (total) {
    const fill = el('div', undefined, 'meter-fill f-' + ratioClass(used, total));
    fill.style.width = Math.round((used / total) * 100) + '%';
    meter.appendChild(fill);
  }
  meter.appendChild(el('span', total ? used + '/' + total : 'n/a', 'meter-label'));
  return meter;
}
function coverageCellFrom(used, total) {
  return meterCell(used, total, total - used);
}
function coverageCell(entry) {
  return coverageCellFrom(entry.valueUsedByExample, entry.valueTotal);
}
function coverageCompare(a, b, dir) {
  const naA = a.valueTotal === 0;
  const naB = b.valueTotal === 0;
  if (naA !== naB) return naA ? 1 : -1;
  if (naA && naB) return a.importPath < b.importPath ? -1 : 1;
  const ra = a.valueUsedByExample / a.valueTotal;
  const rb = b.valueUsedByExample / b.valueTotal;
  if (ra !== rb) return (ra < rb ? -1 : 1) * dir;
  if (a.valueUsedByExample !== b.valueUsedByExample) return b.valueUsedByExample - a.valueUsedByExample;
  if (a.valueTotal !== b.valueTotal) return a.valueTotal - b.valueTotal;
  return a.importPath < b.importPath ? -1 : 1;
}

function list(names) {
  if (!names.length) return '\u2014';
  return names.length > 6 ? names.slice(0, 6).join(', ') + ' +' + (names.length - 6) + ' more' : names.join(', ');
}
function bucketCell(b, isValue) {
  const count = b.consumers.length;
  const suffix = isValue && b.typeOnly && count ? ' (type only)' : '';
  const cell = el('td', (count || '\u2014') + suffix, 'num');
  cell.title = b.consumers.join(', ');
  return cell;
}
function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
function matches(entry) {
  if (state.hideCovered && missing(entry) === 0) return false;
  if (!state.filter) return true;
  const q = state.filter.toLowerCase();
  return entry.importPath.toLowerCase().includes(q) || entry.symbols.some(s => s.name.toLowerCase().includes(q));
}
function sorted() {
  const column = COLUMNS.find(c => c.key === state.sort) || COLUMNS[0];
  const rows = REPORT.entries.filter(matches);
  return rows.sort((a, b) => {
    if (column.cmp) return column.cmp(a, b, state.dir);
    const x = column.sort(a);
    const y = column.sort(b);
    if (x === y) return a.importPath < b.importPath ? -1 : 1;
    return (x < y ? -1 : 1) * state.dir;
  });
}
function symbolRows(entry) {
  let ordered = [...entry.symbols].sort((a, b) => Number(b.isValue) - Number(a.isValue));
  if (!state.showTypes) ordered = ordered.filter(s => s.isValue);
  if (state.hideCovered) ordered = ordered.filter(s => !s.coveredByExample);
  return ordered.map((symbol) => {
    const row = el('tr', undefined, 'symrow');
    const name = el('td', symbol.name, symbol.noExternalConsumer ? 'muted' : undefined);
    name.title = symbol.noExternalConsumer ? 'no external consumer' : '';
    row.appendChild(name);
    row.appendChild(bucketCell(symbol.example, symbol.isValue));
    row.appendChild(bucketCell(symbol.other, symbol.isValue));
    row.appendChild(el('td', symbol.kind, 'kind muted'));
    return row;
  });
}
function renderHead() {
  const head = document.getElementById('head');
  head.textContent = '';
  for (const column of COLUMNS) {
    const arrow = state.sort === column.key ? (state.dir > 0 ? ' \u25B2' : ' \u25BC') : '';
    const th = el('th', column.label + arrow, column.cls);    if (column.hint) th.title = column.hint;    th.addEventListener('click', () => {
      if (state.sort === column.key) state.dir = -state.dir;
      else { state.sort = column.key; state.dir = column.cls === 'num' ? -1 : 1; }
      renderHead();
      renderRows();
    });
    head.appendChild(th);
  }
}
function entryRow(entry) {
  const row = el('tr', undefined, 'entry r-' + coverageClass(entry));
  const label = entry.importPath.replace(new RegExp('^@pierre/ecs/(modules/)?'), '');
  const nameCell = el('td', (state.open[entry.importPath] ? '\u25BE ' : '\u25B8 ') + label);
  nameCell.title = entry.importPath;
  row.appendChild(nameCell);
  for (const column of COLUMNS.slice(1)) {
    let cell;
    if (column.cell) {
      cell = document.createElement('td');
      if (column.cls) cell.className = column.cls;
      cell.appendChild(column.cell(entry));
    } else {
      cell = el('td', String(column.text(entry)), column.gap ? 'num c-' + coverageClass(entry) : column.cls);
    }
    if (column.hover) cell.title = column.hover(entry);
    row.appendChild(cell);
  }
  row.addEventListener('click', () => {
    state.open[entry.importPath] = !state.open[entry.importPath];
    renderRows();
  });
  return row;
}
function groupRow(group, open, locked) {
  const used = group.entries.reduce((sum, e) => sum + e.valueUsedByExample, 0);
  const total = group.entries.reduce((sum, e) => sum + e.valueTotal, 0);
  const row = el('tr', undefined, 'group r-' + ratioClass(used, total));
  const prefix = locked ? '' : (open ? '\u25BE ' : '\u25B8 ');
  row.appendChild(el('td', prefix + group.label + ' (' + group.entries.length + ')'));
  row.appendChild(el('td', ''));
  row.appendChild(el('td', ''));
  const cov = el('td', undefined, 'coverage');
  cov.appendChild(coverageCellFrom(used, total));
  row.appendChild(cov);
  if (!locked) {
    row.addEventListener('click', () => {
      state.group[group.key] = !state.group[group.key];
      renderRows();
    });
  }
  return row;
}
function renderRows() {
  const body = document.getElementById('rows');
  body.textContent = '';
  const rows = sorted();
  const locked = Boolean(state.filter || state.hideCovered);
  const groups = [
    { key: 'core', label: 'core', entries: rows.filter(e => !e.isModule) },
    { key: 'modules', label: 'modules', entries: rows.filter(e => e.isModule) },
  ];
  for (const group of groups) {
    if (!group.entries.length) continue;
    const open = locked || state.group[group.key];
    body.appendChild(groupRow(group, open, locked));
    if (!open) continue;
    for (const entry of group.entries) {
      body.appendChild(entryRow(entry));
      if (state.open[entry.importPath])
        for (const symbolRow of symbolRows(entry)) body.appendChild(symbolRow);
    }
  }
}
function renderStats() {
  const h = REPORT.headline;
  const items = [
    ['entries', h.entries, 'public entry points \u2014 core primitives plus module subpaths'],
    ['modules', h.modules, 'entries under @pierre/ecs/modules/*'],
    ['symbols', h.symbols, 'exported symbols across all entries (value + type)'],
    ['value exports', h.valueSymbols, 'runtime exports (functions, consts, classes) an example can call'],
    ['no example ref', h.valueWithoutExample, 'value exports no example references (may still be covered by tests or other modules)'],
    ['no external consumer', h.noExternalConsumer, 'symbols nothing references outside their own source'],
    ['entries without example', h.entriesWithoutExample, 'entries no example package reaches at all'],
  ];
  const stats = document.getElementById('stats');
  for (const item of items) {
    const li = document.createElement('li');
    li.title = item[2];
    li.appendChild(document.createTextNode(item[0] + ' '));
    const value = document.createElement('b');
    value.textContent = String(item[1]);
    li.appendChild(value);
    stats.appendChild(li);
  }
}
function renderExamples() {
  const body = document.getElementById('examples');
  for (const example of REPORT.examples) {
    const row = document.createElement('tr');
    row.appendChild(el('td', example.name));
    row.appendChild(el('td', String(example.entries), 'num'));
    row.appendChild(el('td', String(example.value), 'num'));
    row.appendChild(el('td', String(example.type), 'num'));
    body.appendChild(row);
  }
}

document.getElementById('filter').addEventListener('input', event => { state.filter = event.target.value; renderRows(); });
document.getElementById('hide-covered').addEventListener('change', event => { state.hideCovered = event.target.checked; renderRows(); });
document.getElementById('show-types').addEventListener('change', event => { state.showTypes = event.target.checked; renderRows(); });
renderStats();
renderHead();
renderRows();
renderExamples();
</script>
</body>
</html>
`;
}
