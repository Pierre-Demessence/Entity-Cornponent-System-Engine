/**
 * Discovers the API symbols a module README *documents* in its `.d.ts`-style
 * signature-listing blocks, so a name that no longer exists (a renamed or removed
 * export) fails `npm test`. This is the complement to the runnable-example
 * compile gate (`readme-samples.ts`): those blocks are reference tables, not
 * code, so the compiler cannot check them — but the names they list can be
 * matched against the real public surface.
 *
 * A signature-listing block is a non-runnable `ts` fence that is a reference
 * table rather than code: it either declares a bodyless function signature
 * (`function foo(x: T): R;`) or is declaration-only (a `class`/`interface`/`type`
 * table with no executable statements). That gate keeps genuine usage examples —
 * which bind and call things, and declare *local* illustrative types like
 * `type State = 'a' | 'b'` — out, so only documented API names are checked.
 *
 * Pure: reads the READMEs and returns the symbol list. The test
 * (`readme-symbols.test.ts`) resolves each name against the engine surface.
 */
import { isRunnable, moduleSamples } from './readme-samples';

/** One top-level declaration named in a signature-listing block. */
export interface DeclaredSymbol {
  /** The declared name, e.g. `makeFsm`. */
  name: string;
  /** The declaration keyword it was introduced with. */
  kind: 'function' | 'class' | 'interface' | 'type';
  /** One-based README line of the declaration. */
  line: number;
  /** Module directory name, e.g. `fsm`. */
  module: string;
  /** Repo-relative README path, for diagnostics. */
  readmeRel: string;
}

/**
 * A documented name that is intentionally not a public export, with the reason.
 * The length of this list measures how much of the signature listings diverge
 * from the real surface for a good reason rather than a stale-doc bug.
 */
export interface SymbolAllowance {
  name: string;
  reason: string;
}

export const SYMBOL_ALLOWLIST: readonly SymbolAllowance[] = [];

// A bodyless function signature line (`function foo(x: T): R;`): `function`, a
// parenthesised parameter list, a return annotation, then a semicolon, and no
// body brace. Each negated class is bounded by a literal it excludes, so the
// match stays linear (no catastrophic backtracking).
const BODYLESS_FUNCTION = /^\s*(?:export |declare )*function\b[^()\n{}]*\([^()\n{}]*\)[^\n{};]*;\s*$/m;
const DECLARATION = /^\s*(?:export\s+)?(?:declare\s+)?(function|class|interface|type)\s+([A-Za-z_$][\w$]*)/;
const HAS_DECLARATION = /^\s*(?:export\s+)?(?:declare\s+)?(?:function|class|interface|type)\s+[A-Za-z_$]/m;
// Markers of a usage example (executable code) rather than a reference table.
const EXECUTABLE = /^\s*(?:const|let|var)\s+\w+\s*[:=]|=>|\breturn\b|\.\w+\(|^\s*(?:for|while|if|switch)\b/m;

/**
 * A block is a signature listing — a reference table, not runnable code — when it
 * imports nothing from `@pierre/ecs` and either documents a bodyless function
 * signature or is declaration-only (no executable statements).
 */
export function isSignatureListing(code: string): boolean {
  if (isRunnable(code))
    return false;
  if (BODYLESS_FUNCTION.test(code))
    return true;
  return HAS_DECLARATION.test(code) && !EXECUTABLE.test(code);
}

/** Every top-level `function`/`class`/`interface`/`type` named in a listing. */
export function declaredSymbols(): DeclaredSymbol[] {
  const out: DeclaredSymbol[] = [];
  for (const sample of moduleSamples()) {
    if (!isSignatureListing(sample.code))
      continue;
    sample.code.split('\n').forEach((line, offset) => {
      const match = DECLARATION.exec(line);
      if (match) {
        out.push({
          name: match[2],
          kind: match[1] as DeclaredSymbol['kind'],
          line: sample.startLine + offset,
          module: sample.module,
          readmeRel: sample.readmeRel,
        });
      }
    });
  }
  return out;
}
