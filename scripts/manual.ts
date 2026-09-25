/**
 * Generates the Manual content for the Starlight site: one markdown page per
 * module, from that module's own `src/modules/<name>/README.md`. Starlight owns
 * the layout, sidebar, search and syntax highlighting from there.
 *
 * The READMEs are the single source — nothing is copied by hand, and no
 * frontmatter is added to them. Links are rewritten because they are written for
 * readers *inside* the repo, not for the published site.
 *
 * Pure: this module writes nothing. The CLI wrapper (`manual.gen.ts`) writes the
 * files; the test (`manual.test.ts`) asserts the same output.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const MODULE_DIR = join(ROOT, 'src/modules');
const REPO_URL = 'https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine';
const SUMMARY_MAX = 160;

export interface ManualPage {
  markdown: string;
  /** Path relative to Starlight's content directory, e.g. `manual/math.md`. */
  outPath: string;
}

interface Guide {
  name: string;
  markdown: string;
  readmePath: string;
}

/** Plain code-unit ordering, so the page order is byte-stable across machines. */
function byName(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function listGuides(): Guide[] {
  return readdirSync(MODULE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort(byName)
    .flatMap((name) => {
      const readmePath = join(MODULE_DIR, name, 'README.md');
      if (!existsSync(readmePath))
        return [];
      return [{ name, markdown: readFileSync(readmePath, 'utf8'), readmePath }];
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
function summaryOf(markdown: string): string {
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

/**
 * Rewrites one in-repo link target for the published site. Returns `null` when
 * the link must be dropped (internal docs), otherwise the replacement target.
 */
function resolveLink(target: string, fromDir: string, moduleNames: Set<string>): string | null {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target))
    return target;

  // Matched on shape, not on resolution: some READMEs overshoot the repo root by
  // a level, so an unresolvable `docs/` path must still be dropped rather than
  // published as a dead link.
  if (/(?:^|\/)docs\//.test(target))
    return null;

  const sibling = /^\.\.\/([^/]+)\/README\.md$/.exec(target);
  if (sibling && moduleNames.has(sibling[1]))
    return `../${sibling[1]}/`;

  const absolute = resolve(fromDir, target);
  if (relative(ROOT, absolute).startsWith('..'))
    return target;

  if (relative(ROOT, absolute).split(sep)[0] === 'docs')
    return null;

  return existsSync(absolute) ? githubUrl(absolute) : target;
}

/**
 * Rewrites links outside fenced code blocks only — the READMEs contain code
 * samples with bracketed syntax that must survive verbatim.
 */
function rewriteLinks(markdown: string, readmePath: string, moduleNames: Set<string>): string {
  const fromDir = join(readmePath, '..');
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
        const resolved = resolveLink(target, fromDir, moduleNames);
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
  const guides = listGuides();
  const moduleNames = new Set(guides.map(guide => guide.name));

  const pages = guides.map((guide) => {
    const description = summaryOf(guide.markdown) || `Guide for the ${guide.name} module.`;
    const body = rewriteLinks(bodyOf(guide.markdown), guide.readmePath, moduleNames);
    const intro = `Import from \`@pierre/ecs/modules/${guide.name}\`.\n\n`;
    return {
      markdown: `${frontmatter(guide.name, description)}${intro}${body}\n`,
      outPath: `manual/${guide.name}.md`,
    };
  });

  return [renderIndexPage(), ...pages];
}
