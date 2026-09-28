/**
 * Discovers the runnable TypeScript examples in every Markdown file published as
 * a Manual page — module READMEs (`src/modules/<name>/README.md`), core guides
 * (`src/<name>.md`) and hand-authored pages (`website/manual/**`) — and returns
 * them for type-checking. Each is republished verbatim (see `manual.ts`), so an
 * example that does not compile against the real API is a defect shipped to
 * readers copying it.
 *
 * Only *runnable* blocks are checked: a block that imports from `@pierre/ecs` is
 * a self-contained, copy-pasteable example the compiler can check. The other
 * `ts` fences — `.d.ts`-style signature listings (`function f(x: T): R;`) and
 * inline cheat-sheets — are API *reference*, not code, and are name-checked by
 * `readme-symbols.ts` instead.
 *
 * A page listed in `SINGLE_FILE_PAGES` builds one program over several blocks,
 * so it is returned as one sample: every block of the page, kept on its own
 * Markdown lines, as a single file.
 *
 * Pure: this module reads the Markdown and returns the sample list. It builds no
 * compiler program and writes nothing — `doc-samples.test.ts` type-checks the
 * samples and `manual-walkthroughs.test.ts` executes the ones that must run.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the repo root. */
export const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

const MODULE_DIR = join(ROOT, 'src/modules');
const SRC_DIR = join(ROOT, 'src');
const AUTHORED_DIR = join(ROOT, 'website/manual');

/** One fenced `ts`/`typescript` block lifted from a published Markdown file. */
export interface Sample {
  /** The block's contents, without the fences. */
  code: string;
  /** Repo-relative Markdown path, for diagnostics — e.g. `src/modules/spatial/README.md`. */
  docRel: string;
  /** Zero-based ordinal of this block within its document. */
  index: number;
  /**
   * Short name of the document: the module directory for a module README
   * (`spatial`), otherwise the path without extension (`src/world`,
   * `website/manual/guides/tutorial`).
   */
  source: string;
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
  reason: string;
  source: string;
}

export const SAMPLE_EXCLUSIONS: readonly Exclusion[] = [
  {
    index: 2,
    source: 'collision-3d',
    reason: 'Reads game component stores (Position3DDef/ShapeAabb3Def) and '
      + 'dereferences their fields; the component types live in the consuming '
      + 'game, so `getStore(def).get(id)!.w` cannot be typed in isolation.',
  },
];

/**
 * Authored pages whose blocks are steps of one program rather than independent
 * examples, keyed by repo-relative path.
 */
export const SINGLE_FILE_PAGES: ReadonlySet<string> = new Set([
  'website/manual/guides/tutorial.md',
]);

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

/**
 * Every `ts` block of `markdown` joined into one file, each block on the lines
 * it occupies in the document and every other line blank. Keeping the lines
 * aligned means a diagnostic's line *is* the Markdown line.
 */
export function joinSamples(markdown: string): string {
  const out = markdown.split('\n').map(() => '');
  for (const block of extractSamples(markdown)) {
    block.code.split('\n').forEach((line, i) => {
      out[block.startLine - 1 + i] = line;
    });
  }
  return out.join('\n');
}

/** Plain code-unit ordering, so the sample order is byte-stable across machines. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toRel(path: string): string {
  return relative(ROOT, path).split(sep).join('/');
}

function samplesOf(path: string, source: string): Sample[] {
  const markdown = readFileSync(path, 'utf8');
  const docRel = toRel(path);
  if (SINGLE_FILE_PAGES.has(docRel))
    return [{ code: joinSamples(markdown), docRel, index: 0, source, startLine: 1 }];
  return extractSamples(markdown).map((block, index) => ({
    code: block.code,
    docRel,
    index,
    source,
    startLine: block.startLine,
  }));
}

/** Every module README's samples, in module-name then document order. */
export function moduleSamples(): Sample[] {
  return readdirSync(MODULE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort(byName)
    .flatMap((module) => {
      const readmePath = join(MODULE_DIR, module, 'README.md');
      return existsSync(readmePath) ? samplesOf(readmePath, module) : [];
    });
}

function markdownFilesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join(entry.parentPath, entry.name))
    .sort(byName);
}

/**
 * Every sample on a Manual page that is not a module README: the core guides
 * beside their source, then the hand-authored pages.
 */
export function manualSamples(): Sample[] {
  const coreGuides = readdirSync(SRC_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => join(SRC_DIR, entry.name))
    .sort(byName);
  return [...coreGuides, ...markdownFilesUnder(AUTHORED_DIR)]
    .flatMap(path => samplesOf(path, toRel(path).replace(/\.md$/, '')));
}

/** One published page's samples, by repo-relative path. */
export function pageSamples(docRel: string): Sample[] {
  return samplesOf(join(ROOT, docRel), docRel.replace(/\.md$/, ''));
}
