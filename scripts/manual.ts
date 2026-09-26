/**
 * Generates the Manual content for the Starlight site: one markdown page per
 * module (from `src/modules/<name>/README.md`) and per core primitive (from
 * `src/<name>.md`), published as the **Modules** and **Core** sidebar groups.
 * Starlight owns the layout, sidebar, search and syntax highlighting from there.
 *
 * The source `.md` files are the single source — nothing is copied by hand, and
 * no frontmatter is added to them. Links are rewritten because they are written
 * for readers *inside* the repo, not for the published site.
 *
 * Pure: this module writes nothing. The CLI wrapper (`manual.gen.ts`) writes the
 * files; the test (`manual.test.ts`) asserts the same output.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const MODULE_DIR = join(ROOT, 'src/modules');
const SRC_DIR = join(ROOT, 'src');
const REPO_URL = 'https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine';
const SUMMARY_MAX = 160;

/**
 * Core-primitive guides, co-located with their source in `src/<name>.md` and
 * published as the Manual's **Core** group. The value is the import line shown
 * at the top of each page; most map to a `@pierre/ecs/<name>` subpath export.
 */
const CORE_GUIDES: Record<string, string> = {
  'component-store': 'Import from `@pierre/ecs/component-store`.',
  'event-bus': 'Import from `@pierre/ecs/event-bus`.',
  'query': 'Import from `@pierre/ecs/query`.',
  'scheduler': 'Import from `@pierre/ecs/scheduler`.',
  'spatial-structure': 'Import from `@pierre/ecs/spatial-structure`.',
  'template': 'Import from `@pierre/ecs/template`.',
  'tick': 'Import from `@pierre/ecs/tick-source` and `@pierre/ecs/tick-runner`.',
  'world': 'Import from `@pierre/ecs/world`.',
};

export interface ManualPage {
  markdown: string;
  /** Path relative to Starlight's content directory, e.g. `manual/math.md`. */
  outPath: string;
}

/** A published guide: a module README or a core-primitive deep-dive. */
type GuideGroup = 'core' | 'modules';

interface Guide {
  name: string;
  group: GuideGroup;
  /** The `Import from …` line rendered above the guide body. */
  importLine: string;
  markdown: string;
  /** The source `.md` file, used as the base for resolving its links. */
  sourcePath: string;
}

/** Context a page's links resolve against: its group plus the known guide names. */
interface LinkContext {
  coreNames: Set<string>;
  group: GuideGroup;
  moduleNames: Set<string>;
}

/** Plain code-unit ordering, so the page order is byte-stable across machines. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function listModuleGuides(): Guide[] {
  return readdirSync(MODULE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort(byName)
    .flatMap((name) => {
      const readmePath = join(MODULE_DIR, name, 'README.md');
      if (!existsSync(readmePath))
        return [];
      return [{
        name,
        group: 'modules' as const,
        importLine: `Import from \`@pierre/ecs/modules/${name}\`.`,
        markdown: readFileSync(readmePath, 'utf8'),
        sourcePath: readmePath,
      }];
    });
}

/** The core-primitive guides, read from `src/<name>.md` in a stable order. */
function listCoreGuides(): Guide[] {
  return Object.keys(CORE_GUIDES)
    .sort(byName)
    .flatMap((name) => {
      const sourcePath = join(SRC_DIR, `${name}.md`);
      if (!existsSync(sourcePath))
        return [];
      return [{
        name,
        group: 'core' as const,
        importLine: CORE_GUIDES[name],
        markdown: readFileSync(sourcePath, 'utf8'),
        sourcePath,
      }];
    });
}

/**
 * Module directories that ship without a README, so the build can say so rather
 * than silently publishing an incomplete Manual.
 */
export function modulesWithoutReadme(): string[] {
  return readdirSync(MODULE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !existsSync(join(MODULE_DIR, name, 'README.md')))
    .sort(byName);
}

/**
 * The README's first paragraph, flattened to one line for the sidebar and meta
 * description. Markup is unwrapped rather than deleted: a blanket strip of `*`
 * and `_` mangles real text such as `A\* pathfinding` or `bevy_pathfinding`.
 */
export function summaryOf(markdown: string): string {
  const body = markdown.replace(/^#.*$/m, '').trim();
  const paragraph = body.split(/\n\s*\n/).find(chunk => !chunk.startsWith('#'));
  if (!paragraph)
    return '';
  const flat = paragraph
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\\(.)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= SUMMARY_MAX)
    return flat;
  const head = flat.slice(0, SUMMARY_MAX);
  const lastSpace = head.lastIndexOf(' ');
  return `${(lastSpace > 0 ? head.slice(0, lastSpace) : head).trimEnd()}...`;
}

function githubUrl(absolutePath: string): string {
  const rel = relative(ROOT, absolutePath).split(sep).join('/');
  const kind = statSync(absolutePath).isDirectory() ? 'tree' : 'blob';
  return `${REPO_URL}/${kind}/main/${rel}`;
}

/** Site route to a guide page, relative to a page in `fromGroup`. */
function routeTo(fromGroup: GuideGroup, group: GuideGroup, name: string): string {
  return fromGroup === group ? `../${name}/` : `../../${group}/${name}/`;
}

/**
 * Rewrites one in-repo link target for the published site. Returns `null` when
 * the link must be dropped (internal docs), otherwise the replacement target.
 *
 * Links are classified by what they resolve to: a core guide (`src/<name>.md`)
 * or module README routes to that guide's page; anything under `docs/` is
 * internal and dropped; source files and examples point at GitHub.
 */
function resolveLink(target: string, fromDir: string, ctx: LinkContext): string | null {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target))
    return target;

  // Matched on shape, not on resolution: some READMEs overshoot the repo root by
  // a level, so an unresolvable `docs/` path must still be dropped rather than
  // published as a dead link.
  if (/(?:^|\/)docs\//.test(target))
    return null;

  const absolute = resolve(fromDir, target);
  const rel = relative(ROOT, absolute).split(sep).join('/');

  const core = /^src\/([^/]+)\.md$/.exec(rel);
  if (core && ctx.coreNames.has(core[1]))
    return routeTo(ctx.group, 'core', core[1]);

  const mod = /^src\/modules\/([^/]+)\/README\.md$/.exec(rel);
  if (mod && ctx.moduleNames.has(mod[1]))
    return routeTo(ctx.group, 'modules', mod[1]);

  if (rel.startsWith('..'))
    return target;

  if (rel.split('/')[0] === 'docs')
    return null;

  return existsSync(absolute) ? githubUrl(absolute) : target;
}

/**
 * Rewrites links outside fenced code blocks only — the READMEs contain code
 * samples with bracketed syntax that must survive verbatim.
 */
function rewriteLinks(markdown: string, sourcePath: string, ctx: LinkContext): string {
  const fromDir = join(sourcePath, '..');
  const linkPattern = /(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g;
  let inFence = false;

  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence)
        return line;
      return line.replace(linkPattern, (_match, text: string, target: string) => {
        const resolved = resolveLink(target, fromDir, ctx);
        return resolved === null ? text : `[${text}](${resolved})`;
      });
    })
    .join('\n');
}

/** Drop the README's own `# Title`; Starlight renders the frontmatter title instead. */
function bodyOf(markdown: string): string {
  const lines = markdown.split('\n');
  const first = lines.findIndex(line => line.trim() !== '');
  if (first !== -1 && lines[first].startsWith('#'))
    lines.splice(first, 1);
  return lines.join('\n').trim();
}

/**
 * YAML frontmatter, with the description quoted so prose punctuation is inert.
 * `hidden` keeps a page out of the sidebar while still publishing its route.
 */
function frontmatter(title: string, description: string, hidden = false): string {
  const quoted = (value: string): string =>
    `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  const sidebar = hidden ? 'sidebar:\n  hidden: true\n' : '';
  return `---\ntitle: ${quoted(title)}\ndescription: ${quoted(description)}\n${sidebar}---\n\n`;
}

/**
 * The section landing page — the Overview entry in the Manual sidebar. Its prose
 * is authored in `website/manual-overview.md`, the one site source outside this
 * generator; frontmatter and the hidden-sidebar flag are added here so that
 * everything under `manual/` stays generated and nothing is hand-placed there.
 */
function renderIndexPage(): ManualPage {
  const source = readFileSync(join(ROOT, 'website/manual-overview.md'), 'utf8').trim();
  const description = summaryOf(source) || 'How the Manual is organised.';
  return {
    markdown: `${frontmatter('Overview', description, true)}${source}\n`,
    outPath: 'manual/index.md',
  };
}

/** Build every Manual page, ready to be written into the Starlight content directory. */
export function renderManualPages(): ManualPage[] {
  const coreGuides = listCoreGuides();
  const moduleGuides = listModuleGuides();
  const coreNames = new Set(coreGuides.map(guide => guide.name));
  const moduleNames = new Set(moduleGuides.map(guide => guide.name));

  const render = (guide: Guide): ManualPage => {
    const description = summaryOf(guide.markdown) || `Guide for ${guide.name}.`;
    const ctx: LinkContext = { coreNames, group: guide.group, moduleNames };
    const body = rewriteLinks(bodyOf(guide.markdown), guide.sourcePath, ctx);
    const intro = `${guide.importLine}\n\n`;
    return {
      markdown: `${frontmatter(guide.name, description)}${intro}${body}\n`,
      outPath: `manual/${guide.group}/${guide.name}.md`,
    };
  };

  return [renderIndexPage(), ...coreGuides.map(render), ...moduleGuides.map(render)];
}
