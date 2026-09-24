/**
 * Shared enumeration of the engine's public surface, used by both generated
 * catalogs: `engine-api.ts` ("what exists") and `engine-usage.ts` ("what is
 * used"). Pure: reads `package.json` and the compiler program; writes nothing.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/** Absolute path of the repo root. */
export const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/** One `package.json` `exports` entry: an import path and the file behind it. */
export interface Entry {
  file: string;
  importPath: string;
  isModule: boolean;
}

/** Coarse symbol classification, rendered verbatim into both catalogs. */
export type SymbolKind
  = | 'fn'
    | 'class'
    | 'interface'
    | 'type'
    | 'enum'
    | 'const'
    | 'value';

/**
 * Enumerate the public surface from the `exports` map. The aggregate root (`.`)
 * is skipped: every symbol it carries is also reachable through a subpath, so
 * counting it would double-count. `./modules/*` expands to one entry per
 * directory under `src/modules/`.
 */
export function readEntries(): Entry[] {
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

/** Classify a resolved symbol by its declaration flags. */
export function kindOf(s: ts.Symbol): SymbolKind {
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

/**
 * A type has no runtime behaviour to exercise — referencing one *is* its
 * surface. Everything else (functions, classes, runtime consts) is "used" only
 * when something references it from a value position.
 */
export function isValueKind(kind: SymbolKind): boolean {
  return kind !== 'type' && kind !== 'interface';
}

/**
 * Case-insensitive comparison that is independent of the host ICU/locale data
 * (uses Unicode default case mapping + code-unit order), so generated catalogs
 * are byte-stable across machines — the drift tests depend on it.
 */
export function compareNames(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la !== lb)
    return la < lb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A public export resolved to its canonical (alias-free) declaration. */
export interface PublicSymbol {
  name: string;
  declarationFile: string;
  kind: SymbolKind;
  symbol: ts.Symbol;
}

/** Follow one level of re-export alias chain to the original declaration. */
export function resolveAlias(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/**
 * Enumerate one entry's exports, alias-resolved and name-sorted. Aliases are
 * resolved so a consumer's reference and the original declaration share a single
 * symbol identity — the usage report matches on exactly that.
 */
export function publicSymbolsOf(
  program: ts.Program,
  checker: ts.TypeChecker,
  entry: Entry,
): PublicSymbol[] {
  const sf = program.getSourceFile(entry.file);
  if (!sf)
    throw new Error(`engine surface: entry file not found in program: ${entry.file}`);
  const moduleSymbol = checker.getSymbolAtLocation(sf);
  const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
  return exports
    .map((exp) => {
      const resolved = resolveAlias(exp, checker);
      return {
        name: exp.getName(),
        declarationFile: resolved.getDeclarations()?.[0]?.getSourceFile().fileName ?? entry.file,
        kind: kindOf(resolved),
        symbol: resolved,
      };
    })
    .sort((a, b) => compareNames(a.name, b.name));
}
