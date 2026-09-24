import type { Entry, SymbolKind } from './engine-surface';

/**
 * Generates the engine usage report (`docs/agent/engine-usage.md`): for every
 * public export, which files reference it, bucketed by consumer kind — an
 * example package, a unit test, or other engine source. The inverse view of
 * `engine-api.ts`: that catalog says what exists, this says what is used.
 *
 * Pure: writes nothing. The CLI wrapper (`engine-usage.gen.ts`) writes the file;
 * the drift test (`engine-usage.test.ts`) compares the committed file against a
 * fresh generation.
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

/** Repo-relative path of the generated report. */
export const ENGINE_USAGE_DOC = 'docs/agent/engine-usage.md';

/**
 * `examples/hub` renders every other example, so counting it would credit all
 * modules to one consumer; `examples/assets` holds art rather than source.
 */
const EXCLUDED_EXAMPLES = new Set(['hub', 'assets']);

/** Per-line cap on listed consumers. */
const MAX_LISTED = 8;

type Bucket = 'example' | 'test' | 'other';

interface BucketUsage {
  consumers: Set<string>;
  type: boolean;
  value: boolean;
}

interface Usage {
  example: BucketUsage;
  other: BucketUsage;
  test: BucketUsage;
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

function emptyBucket(): BucketUsage {
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

function kindOfTarget(target: Target): Mode {
  return isValueKind(target.kind) ? 'value' : 'type';
}

function listNames(names: string[]): string {
  if (names.length === 0)
    return '—';
  const head = names.slice(0, MAX_LISTED).join(', ');
  return names.length > MAX_LISTED ? `${head} +${names.length - MAX_LISTED} more` : head;
}

function describeBucket(usage: BucketUsage, kind: SymbolKind): string {
  if (usage.consumers.size === 0)
    return '—';
  const typeOnly = isValueKind(kind) && !usage.value ? ' (type only)' : '';
  return `${listNames([...usage.consumers].sort(compareNames))}${typeOnly}`;
}

function unionConsumers(symbols: Target[], bucket: Bucket): string[] {
  const names = new Set<string>();
  for (const symbol of symbols) {
    for (const consumer of symbol.usage[bucket].consumers)
      names.add(consumer);
  }
  return [...names].sort(compareNames);
}

function symbolLine(target: Target): string {
  const label = `- **\`${target.name}\`** _(${target.kind})_`;
  if (noExternalConsumer(target))
    return `${label} — no external consumer`;
  return `${label} — examples: ${describeBucket(target.usage.example, target.kind)}`
    + ` · tests: ${describeBucket(target.usage.test, target.kind)}`
    + ` · other: ${describeBucket(target.usage.other, target.kind)}`;
}

interface EntrySection {
  entry: Entry;
  symbols: Target[];
}

function buildSections(entries: Entry[], targets: Target[]): EntrySection[] {
  return [...entries]
    .sort((a, b) => compareNames(a.importPath, b.importPath))
    .map(entry => ({
      entry,
      symbols: targets
        .filter(target => target.entry === entry)
        .sort((a, b) => compareNames(a.name, b.name)),
    }));
}

function entrySummary(symbols: Target[]): string {
  const used = (kind: Mode): number => symbols.filter(s => kindOfTarget(s) === kind && exampleCovered(s)).length;
  const total = (kind: Mode): number => symbols.filter(s => kindOfTarget(s) === kind).length;
  const tests = unionConsumers(symbols, 'test');
  return `value ${used('value')}/${total('value')} · type ${used('type')}/${total('type')}`
    + ` · examples: ${listNames(unionConsumers(symbols, 'example'))}`
    + ` · tests: ${tests.length || '—'}`
    + ` · other: ${listNames(unionConsumers(symbols, 'other'))}`;
}

interface ExampleCoverage {
  entries: Set<string>;
  type: number;
  value: number;
}

function coverageByExample(targets: Target[]): Map<string, ExampleCoverage> {
  const map = new Map<string, ExampleCoverage>();
  for (const target of targets) {
    for (const name of target.usage.example.consumers) {
      const existing = map.get(name);
      const coverage = existing ?? { entries: new Set<string>(), type: 0, value: 0 };
      map.set(name, coverage);
      coverage.entries.add(target.entry.importPath);
      if (kindOfTarget(target) === 'value' && target.usage.example.value)
        coverage.value++;
      else
        coverage.type++;
    }
  }
  return map;
}

/** Build the full markdown report as a deterministic string. */
export function generateEngineUsageMarkdown(): string {
  const program = createUsageProgram();
  const checker = program.getTypeChecker();
  const entries = readEntries();
  const targets = buildTargets(program, checker, entries);
  assertExamplesResolved(program, collectReferences(program, targets));

  const sections = buildSections(entries, targets);
  const modules = sections.filter(s => s.entry.isModule);
  const withExample = sections.filter(s => s.symbols.some(exampleCovered));
  const withoutExample = sections.filter(s => !s.symbols.some(exampleCovered));
  const valueTargets = targets.filter(t => kindOfTarget(t) === 'value');
  const valueNoExample = valueTargets.filter(t => !exampleCovered(t));
  const never = targets.filter(noExternalConsumer);

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
    'value export referenced only from a type position does not count. Symbol',
    'lines list every consumer; `no external consumer` means nothing outside the',
    'symbol\'s own source references it.',
    '',
    '---',
    '',
    '## Headline',
    '',
    `- ${sections.length} public entries (${sections.length - modules.length} core, ${modules.length} modules) · ${targets.length} symbols (${valueTargets.length} value, ${targets.length - valueTargets.length} type)`,
    `- ${withExample.length} entries referenced by at least one example · ${withoutExample.length} with none`,
    `- ${valueNoExample.length} value symbols referenced by no example (${valueNoExample.filter(noExternalConsumer).length} of them with no external consumer at all)`,
    `- ${never.length} symbols with no external consumer`,
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
    for (const section of withoutExample) {
      const tests = unionConsumers(section.symbols, 'test');
      lines.push(
        `- \`${section.entry.importPath}\` — tests: ${tests.length || '—'} · other: ${listNames(unionConsumers(section.symbols, 'other'))}`,
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

  const candidates = modules
    .map(section => ({
      missing: section.symbols.filter(t => kindOfTarget(t) === 'value' && !exampleCovered(t)).length,
      section,
      total: section.symbols.filter(t => kindOfTarget(t) === 'value').length,
    }))
    .filter(c => c.missing > 0)
    .sort((a, b) => b.missing - a.missing || compareNames(a.section.entry.importPath, b.section.entry.importPath));

  if (candidates.length === 0) {
    lines.push('None — every module has at least one value export used by an example.', '');
  }
  else {
    for (const c of candidates)
      lines.push(`- \`${c.section.entry.importPath}\` — ${c.missing} of ${c.total} value exports unreferenced by any example`);
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
  const coverage = [...coverageByExample(targets)]
    .sort((a, b) => (b[1].value + b[1].type) - (a[1].value + a[1].type) || compareNames(a[0], b[0]));
  for (const [name, cov] of coverage)
    lines.push(`| ${name} | ${cov.entries.size} | ${cov.value} | ${cov.type} |`);
  if (coverage.length === 0)
    lines.push('| — | — | — | — |');
  lines.push('');

  const renderGroup = (title: string, group: EntrySection[]): void => {
    lines.push('---', '', `## ${title}`, '');
    for (const section of group) {
      lines.push(`### \`${section.entry.importPath}\``, '', entrySummary(section.symbols), '');
      for (const symbol of section.symbols)
        lines.push(symbolLine(symbol));
      lines.push('');
    }
  };
  renderGroup('Core primitives', sections.filter(s => !s.entry.isModule));
  renderGroup('Modules', modules);

  return `${lines.join('\n')}\n`;
}
