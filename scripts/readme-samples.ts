/**
 * Discovers the runnable TypeScript examples published in each module's
 * `src/modules/<name>/README.md` and returns them for type-checking. Every such
 * README is republished verbatim as a Manual page (see `manual.ts`), so an
 * example that does not compile against the real API is a defect shipped to
 * readers copying it.
 *
 * Only *runnable* blocks are returned: a block that imports from `@pierre/ecs`
 * is a self-contained, copy-pasteable example the compiler can check. The other
 * `ts` fences — `.d.ts`-style signature listings (`function f(x: T): R;`) and
 * inline cheat-sheets — are API *reference*, not code; verifying those is a
 * different tool (a symbol-existence check against the real exports), tracked in
 * `docs/plans/readme-doc-symbol-linter.md`.
 *
 * Pure: this module reads the READMEs and returns the sample list. It builds no
 * compiler program and writes nothing — the test (`readme-samples.test.ts`)
 * assembles the samples into a `ts.Program` and asserts zero diagnostics.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repo root. */
export const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const MODULE_DIR = join(ROOT, 'src/modules');

/** One fenced `ts`/`typescript` block lifted from a module README. */
export interface Sample {
  /** The block's contents, without the fences. */
  code: string;
  /** Zero-based ordinal of this block within its README. */
  index: number;
  /** Module directory name, e.g. `spatial`. */
  module: string;
  /** Repo-relative README path, for diagnostics — e.g. `src/modules/spatial/README.md`. */
  readmeRel: string;
  /** One-based line of the first code line (the line after the opening fence). */
  startLine: number;
}

/**
 * A runnable block that still cannot compile in isolation, with the reason. The
 * length of this list is the measure of how many *runnable* examples are still
 * unverified: every entry names what is missing so it is obvious when the
 * exclusion can be lifted. Signature/reference blocks are not listed here — they
 * are skipped by the runnable gate (see `isRunnable`), which reports its own
 * count.
 */
export interface Exclusion {
  index: number;
  module: string;
  reason: string;
}

export const SAMPLE_EXCLUSIONS: readonly Exclusion[] = [
  {
    index: 2,
    module: 'collision-3d',
    reason: 'Reads game component stores (Position3DDef/ShapeAabb3Def) and '
      + 'dereferences their fields; the component types live in the consuming '
      + 'game, so `getStore(def).get(id)!.w` cannot be typed in isolation.',
  },
];

const OPEN_FENCE = /^```(?:ts|typescript)\s*$/;
const CLOSE_FENCE = /^```\s*$/;
const ECS_IMPORT = /import\s[^;]*from\s*['"]@pierre\/ecs/;

/**
 * A block is runnable — a self-contained example the compiler can check — when
 * it imports from `@pierre/ecs`. Signature listings and cheat-sheets do not.
 */
export function isRunnable(code: string): boolean {
  return ECS_IMPORT.test(code);
}

/**
 * Extract every fenced `ts`/`typescript` block from one markdown document,
 * paired with the one-based line its code starts on. Other fence languages
 * (`text`, `bash`, …) are ignored.
 */
export function extractSamples(markdown: string): { startLine: number; code: string }[] {
  const lines = markdown.split('\n');
  const blocks: { startLine: number; code: string }[] = [];
  let open: { startLine: number; body: string[] } | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open) {
      if (CLOSE_FENCE.test(line)) {
        blocks.push({ code: open.body.join('\n'), startLine: open.startLine });
        open = undefined;
      }
      else {
        open.body.push(line);
      }
    }
    else if (OPEN_FENCE.test(line)) {
      open = { body: [], startLine: i + 2 };
    }
  }
  return blocks;
}

/** Every module README's samples, in module-name then document order. */
export function moduleSamples(): Sample[] {
  const samples: Sample[] = [];
  const modules = readdirSync(MODULE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const module of modules) {
    const readmePath = join(MODULE_DIR, module, 'README.md');
    if (!existsSync(readmePath))
      continue;
    const readmeRel = `src/modules/${module}/README.md`;
    extractSamples(readFileSync(readmePath, 'utf8')).forEach((block, index) => {
      samples.push({ code: block.code, index, module, readmeRel, startLine: block.startLine });
    });
  }
  return samples;
}
