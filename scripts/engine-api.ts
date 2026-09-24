/**
 * Generates the engine API-surface catalog (`docs/agent/engine-api.md`): a
 * terse, one-line-per-symbol map of every public export, grouped by import
 * path. Source of truth is `package.json` `exports` + each symbol's JSDoc
 * summary (re-export aliases are resolved to their original declaration),
 * plus its type-level shape where one fits on a single line.
 *
 * Pure: this module writes nothing. The CLI wrapper (`engine-api.gen.ts`)
 * writes the file; the drift test (`engine-api.test.ts`) compares the committed
 * file against a fresh generation.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/** Repo-relative path of the generated catalog. */
export const ENGINE_API_DOC = 'docs/agent/engine-api.md';

interface Entry {
  file: string;
  importPath: string;
  isModule: boolean;
}

function readEntries(): Entry[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    exports: Record<string, string>;
  };
  const entries: Entry[] = [];
  for (const [key, value] of Object.entries(pkg.exports)) {
    if (key === '.')
      continue; // aggregate root — its symbols are covered by the subpaths
    if (key === './modules/*') {
      const dir = join(ROOT, 'src/modules');
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        if (d.isDirectory()) {
          entries.push({
            file: join(dir, d.name, 'index.ts'),
            importPath: `@pierre/ecs/modules/${d.name}`,
            isModule: true,
          });
        }
      }
    }
    else {
      entries.push({
        file: resolve(ROOT, value),
        importPath: key.replace('./', '@pierre/ecs/'),
        isModule: false,
      });
    }
  }
  return entries;
}

function kindOf(s: ts.Symbol): string {
  const f = s.flags;
  if (f & ts.SymbolFlags.Function)
    return 'fn';
  if (f & ts.SymbolFlags.Class)
    return 'class';
  if (f & ts.SymbolFlags.Interface)
    return 'interface';
  if (f & ts.SymbolFlags.TypeAlias)
    return 'type';
  if (f & (ts.SymbolFlags.Enum | ts.SymbolFlags.ConstEnum))
    return 'enum';
  if (f & (ts.SymbolFlags.Variable | ts.SymbolFlags.BlockScopedVariable))
    return 'const';
  return 'value';
}

function summaryOf(s: ts.Symbol, checker: ts.TypeChecker): string {
  const raw = ts.displayPartsToString(s.getDocumentationComment(checker))
    .replace(/\{@link([^}]*)\}/g, (_, target: string) => target.trim())
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw)
    return '';
  return raw.length > 140 ? `${raw.slice(0, 137)}...` : raw;
}

const SIGNATURE_MAX = 120;

/**
 * `UseAliasDefinedOutsideCurrentScope` is load-bearing: without it a type
 * declared in a sibling file expands to its full structural shape, and a
 * one-line signature becomes a wall of inline object types.
 */
const SIGNATURE_FLAGS = ts.TypeFormatFlags.NoTruncation
  | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

const typePrinter = ts.createPrinter({ removeComments: true });

/** Truncate at a word boundary so a capped shape never ends mid-identifier. */
function cap(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= SIGNATURE_MAX)
    return flat;
  const head = flat.slice(0, SIGNATURE_MAX);
  const lastSpace = head.lastIndexOf(' ');
  return `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd()}…`;
}

/**
 * A symbol's type-level shape on one line: the signature of a callable, the
 * constructor of a class, or the right-hand side of a type alias. Empty when
 * none applies (interfaces, plain consts) — expanding those would break the
 * one-line-per-symbol contract, and the JSDoc summary points at the rest.
 */
function signatureOf(s: ts.Symbol, checker: ts.TypeChecker): string {
  const decl = s.getDeclarations()?.[0];
  if (!decl)
    return '';

  if (ts.isTypeAliasDeclaration(decl)) {
    const source = decl.getSourceFile();
    const rhs = typePrinter.printNode(ts.EmitHint.Unspecified, decl.type, source);
    const params = decl.typeParameters?.map(p => p.getText(source)).join(', ');
    return cap(params ? `<${params}>${rhs}` : rhs);
  }

  const type = checker.getTypeOfSymbolAtLocation(s, decl);
  const [call] = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  if (call)
    return cap(checker.signatureToString(call, decl, SIGNATURE_FLAGS, ts.SignatureKind.Call));

  const [construct] = checker.getSignaturesOfType(type, ts.SignatureKind.Construct);
  if (!construct)
    return '';
  return cap(
    checker.signatureToString(construct, decl, SIGNATURE_FLAGS, ts.SignatureKind.Construct),
  );
}

/**
 * Case-insensitive comparison that is independent of the host ICU/locale data
 * (uses Unicode default case mapping + code-unit order), so the generated
 * catalog is byte-stable across machines — the drift test depends on it.
 */
function compareNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb)
    return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Build the full markdown catalog as a deterministic string. */
export function generateEngineApiMarkdown(): string {
  const configFile = ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);
  const program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
  const checker = program.getTypeChecker();

  const entries = readEntries();
  const byName = (a: Entry, b: Entry): number => compareNames(a.importPath, b.importPath);
  const core = entries.filter(e => !e.isModule).sort(byName);
  const modules = entries.filter(e => e.isModule).sort(byName);

  const lines: string[] = [
    '<!-- GENERATED by scripts/engine-api.gen.ts — do not edit by hand. Run `npm run docs:api`. -->',
    '',
    '# Engine API surface',
    '',
    'A flat, one-line-per-symbol catalog of every public export, grouped by import',
    'path. **Read this first when authoring a consumer** to find an existing helper',
    'before hand-rolling one. Generated from `package.json` exports, the type',
    'checker (signatures), and JSDoc; regenerate with `npm run docs:api`.',
    '',
    'Each entry reads `Name (kind) shape — summary`. `shape` is the type-level',
    'signature, emitted where one fits on a single line: parameters and return type',
    'for a callable, the constructor for a class (its members are not listed — see',
    'the module README), the right-hand side for a type alias. It is capped at 120',
    'characters with `…`, so a capped shape means "read the source for the rest".',
    'A plain interface or non-callable const has no such signature, so its summary',
    'is the pointer into the module README.',
    '',
    'Most core symbols are also re-exported from the `@pierre/ecs` root (a few are',
    'subpath-only). A `— —` marks an export whose JSDoc summary is missing.',
  ];

  const renderSection = (e: Entry): void => {
    const sf = program.getSourceFile(e.file);
    if (!sf)
      throw new Error(`engine-api: entry file not found in program: ${e.file}`);
    const moduleSymbol = checker.getSymbolAtLocation(sf);
    const exps = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
    if (exps.length === 0)
      return;
    const rows = exps
      .map((exp) => {
        const resolved = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
        return {
          name: exp.getName(),
          kind: kindOf(resolved),
          signature: signatureOf(resolved, checker),
          summary: summaryOf(resolved, checker),
        };
      })
      .sort((a, b) => compareNames(a.name, b.name));
    lines.push('', `### \`${e.importPath}\``);
    for (const r of rows) {
      const shape = r.signature ? ` \`${r.signature}\`` : '';
      const tail = r.summary ? ` — ${r.summary}` : ' — —';
      lines.push(`- **\`${r.name}\`** _(${r.kind})_${shape}${tail}`);
    }
  };

  lines.push('', '---', '', '## Core primitives');
  for (const e of core)
    renderSection(e);
  lines.push('', '---', '', '## Modules');
  for (const e of modules)
    renderSection(e);

  return `${lines.join('\n')}\n`;
}
