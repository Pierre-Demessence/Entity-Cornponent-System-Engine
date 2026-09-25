/**
 * Renders the consumer-facing Manual: one guide page per module, built from
 * that module's own `src/modules/<name>/README.md`, plus an index. Pure — the
 * CLI wrapper (`manual.gen.ts`) writes the files.
 *
 * The READMEs are written for readers *inside* the repo, so links are rewritten
 * for the published site: sibling guides become Manual pages, example links
 * point at GitHub, and `docs/**` links are dropped because that tree is
 * internal and must not be advertised from the public site.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const MODULE_DIR = join(ROOT, 'src/modules');
const REPO_URL = 'https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine';
const SUMMARY_MAX = 160;
const INDEX_DESCRIPTION = 'Task-oriented guides for the @pierre/ecs engine: what each module is for, and when to reach for it.';

export interface ManualPage {
  html: string;
  /** Output path relative to `_site/`, e.g. `manual/math.html`. */
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
 * Module directories that ship without a README, so the build can say so
 * rather than silently publishing an incomplete Manual.
 */
export function modulesWithoutReadme(): string[] {
  return readdirSync(MODULE_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => !existsSync(join(MODULE_DIR, name, 'README.md')))
    .sort(byName);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The README's first paragraph, flattened to one line for the index. Markup is
 * unwrapped rather than deleted: a blanket strip of `*` and `_` mangles real
 * text such as `A\* pathfinding` or `bevy_pathfinding`.
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

/** The README's `# Title`, with backticks and markup stripped. */
function titleOf(markdown: string): string {
  const line = markdown.split('\n').find(entry => entry.startsWith('#'));
  if (!line)
    return '';
  return line.replace(/^#+/, '').replace(/`/g, '').trim();
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

  // Matched on shape, not on resolution: some READMEs overshoot the repo root
  // by a level, so an unresolvable `docs/` path must still be dropped rather
  // than published as a dead link.
  if (/(?:^|\/)docs\//.test(target))
    return null;

  const sibling = /^\.\.\/([^/]+)\/README\.md$/.exec(target);
  if (sibling && moduleNames.has(sibling[1]))
    return `/manual/${sibling[1]}.html`;

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

function page(title: string, description: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — @pierre/ecs Manual</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="../manual.css">
</head>
<body class="manual">

<header class="site-header">
  <p class="eyebrow"><a href="../index.html">@pierre/ecs</a> &middot; Manual</p>
  <nav class="actions" aria-label="Primary">
    <a class="button" href="index.html">All guides</a>
    <a class="button" href="../api/">API reference</a>
    <a class="button" href="${REPO_URL}">GitHub</a>
  </nav>
</header>

<main>
${bodyHtml}
</main>

<footer>
  <p>
    MIT licensed &middot;
    <a href="../index.html">Overview</a> &middot;
    <a href="index.html">Manual</a> &middot;
    <a href="../api/">API reference</a> &middot;
    <a href="${REPO_URL}">GitHub</a>
  </p>
</footer>

</body>
</html>
`;
}

function indexBody(guides: Guide[]): string {
  const items = guides
    .map((guide) => {
      const summary = summaryOf(guide.markdown);
      const description = summary ? `\n    <p>${escapeHtml(summary)}</p>` : '';
      return `  <li>
    <a href="./${escapeHtml(guide.name)}.html"><code>${escapeHtml(guide.name)}</code></a>${description}
  </li>`;
    })
    .join('\n');

  return `<h1>Manual</h1>

<p>Task-oriented guides: what each module is for, when you would reach for it,
and how it fits with the rest of the engine. Every guide links to the
<a href="../api/">API reference</a> for exact signatures.</p>

<p>Pre-1.0, so the guides describe intent and the API reference is the current
truth.</p>

<h2>Modules</h2>

<ul class="guide-list">
${items}
</ul>
`;
}

/** Build every Manual page, ready to be written under `_site/`. */
export function renderManualPages(): ManualPage[] {
  const guides = listGuides();
  const moduleNames = new Set(guides.map(guide => guide.name));

  const pages = guides.map((guide) => {
    const body = marked.parse(rewriteLinks(guide.markdown, guide.readmePath, moduleNames)) as string;
    const title = titleOf(guide.markdown) || guide.name;
    const description = summaryOf(guide.markdown) || `Guide for the ${guide.name} module.`;
    return { html: page(title, description, body), outPath: `manual/${guide.name}.html` };
  });

  pages.unshift({
    html: page('Manual', INDEX_DESCRIPTION, indexBody(guides)),
    outPath: 'manual/index.html',
  });
  return pages;
}
