/**
 * Guards the Manual generator's contract: every module README becomes a page,
 * links are rewritten for the published site, internal docs are never linked,
 * and the output is byte-stable.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MODULE_CATEGORIES, renderAuthoredPages, renderManualPages, summaryOf } from './manual';

const pages = renderManualPages();
const byPath = new Map(pages.map(page => [page.outPath, page.markdown]));
const allMarkdown = pages.map(page => page.markdown).join('\n');

function pageFor(name: string): string {
  return byPath.get(`manual/modules/${name}.md`) ?? '';
}

function coreFor(name: string): string {
  return byPath.get(`manual/core/${name}.md`) ?? '';
}

describe('manual generator', () => {
  it('writes a page per module guide', () => {
    expect(byPath.has('manual/modules/behavior-tree.md')).toBe(true);
    expect(pages.length).toBeGreaterThan(40);
  });

  it('publishes core-primitive guides under the Core group', () => {
    expect(byPath.has('manual/core/world.md')).toBe(true);
    expect(byPath.has('manual/core/component-store.md')).toBe(true);
    expect(coreFor('world')).toContain('Import from `@pierre/ecs/world`.');
  });

  it('routes cross-group guide links between Core and Modules', () => {
    // core -> module and core -> core sibling
    expect(coreFor('spatial-structure')).toContain('](../../modules/spatial/)');
    expect(coreFor('world')).toContain('](../component-store/)');
    // module -> core
    expect(pageFor('spatial')).toContain('](../../core/spatial-structure/)');
  });

  it('gives every page frontmatter with a title and description', () => {
    for (const page of pages) {
      expect(page.markdown.startsWith('---\ntitle: ')).toBe(true);
      expect(page.markdown).toContain('\ndescription: "');
    }
  });

  it('drops the README heading so Starlight owns the page title', () => {
    expect(pageFor('behavior-tree')).not.toContain('# `@pierre/ecs/modules/behavior-tree`');
  });

  it('never links into the internal docs tree', () => {
    const internal = [...allMarkdown.matchAll(/\]\(([^)]*docs\/[^)]*)\)/g)]
      .map(match => match[1])
      .filter(target => !/^https?:/.test(target));
    expect(internal).toEqual([]);
  });

  it('rewrites cross-module README links to sibling guide routes', () => {
    const crossLinks = [...allMarkdown.matchAll(/\]\(\.\.\/[a-z0-9-]+\/\)/g)];
    expect(crossLinks.length).toBeGreaterThan(10);
  });

  it('points repo-relative example links at GitHub', () => {
    expect(pageFor('behavior-tree')).toContain('/tree/main/examples/critters');
    expect(pageFor('behavior-tree')).not.toContain('../../../examples/');
  });

  it('leaves fenced code samples untouched', () => {
    expect(pageFor('behavior-tree')).toContain('// one shared tree');
  });

  it('does not mangle identifiers while summarising', () => {
    const summary = summaryOf(
      '# heading\n\nGrid-agnostic A\\* pathfinding built on `bevy_pathfinding`'
      + ' (community).',
    );
    expect(summary).toContain('A* pathfinding');
    expect(summary).toContain('bevy_pathfinding');
  });

  it('keeps an escaped asterisk out of the emphasis rules', () => {
    // Unshielded, `A\*` pairs with the next `*` and deletes the text between.
    const summary = summaryOf(
      '# heading\n\nReaches it via A\\* over states. The *same goal* yields others.',
    );
    expect(summary).toContain('A* over states.');
    expect(summary).toContain('same goal');
  });

  it('is byte-stable across runs', () => {
    expect(JSON.stringify(renderManualPages())).toBe(JSON.stringify(pages));
  });
});

/** The published route of a page: `manual/core/world.md` → `manual/core/world/`. */
function routeOf(outPath: string): string {
  return `${outPath.replace(/\.md$/, '').replace(/\/index$/, '')}/`;
}

/** Resolve a site-route link against the route of the page carrying it. */
function resolveRoute(fromRoute: string, target: string): string {
  const segments = fromRoute.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '' || part === '.')
      continue;
    if (part === '..')
      segments.pop();
    else
      segments.push(part);
  }
  return `${segments.join('/')}/`;
}

/**
 * Markdown with fenced blocks blanked, so a code sample's brackets are not links.
 * Nested fences of different styles would desync the toggle; no page nests them.
 */
function withoutFences(markdown: string): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return '';
      }
      return inFence ? '' : line;
    })
    .join('\n');
}

describe('authored Manual pages', () => {
  it('publishes the landing page with the Overview title, hidden from the sidebar', () => {
    const landing = byPath.get('manual/index.md') ?? '';
    expect(landing).toContain('title: "Overview"');
    expect(landing).toContain('sidebar:\n  hidden: true');
  });

  it('publishes a nested page under its own path, titled by its heading', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecs-manual-'));
    try {
      mkdirSync(join(dir, 'getting-started'), { recursive: true });
      writeFileSync(
        join(dir, 'getting-started', 'demo.md'),
        '# Demo page\n\nBody text.\n',
        'utf8',
      );

      const rendered = renderAuthoredPages(dir);

      expect(rendered.map(page => page.outPath)).toEqual(['manual/getting-started/demo.md']);
      expect(rendered[0].markdown).toContain('title: "Demo page"');
      expect(rendered[0].markdown).toContain('description: "Body text."');
      // Starlight renders the frontmatter title, so the heading must not stay.
      expect(rendered[0].markdown).not.toContain('# Demo page');
      expect(rendered[0].markdown).not.toContain('sidebar:');
    }
    finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('takes the title from a single-hash heading only, and drops that line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecs-manual-'));
    try {
      writeFileSync(join(dir, 'late.md'), 'Intro prose.\n\n# Real title\n\nMore.\n', 'utf8');
      writeFileSync(join(dir, 'sub.md'), '## Only a section\n\nBody.\n', 'utf8');
      writeFileSync(join(dir, 'fenced.md'), '```sh\n# not a title\n```\n\nBody.\n', 'utf8');

      const rendered = new Map(renderAuthoredPages(dir).map(page => [page.outPath, page.markdown]));

      // `## Sub` is a section, so the file name titles the page and the line stays.
      expect(rendered.get('manual/sub.md')).toContain('title: "sub"');
      expect(rendered.get('manual/sub.md')).toContain('## Only a section');
      // The heading titles the page wherever it sits, and must not render twice.
      expect(rendered.get('manual/late.md')).toContain('title: "Real title"');
      expect(rendered.get('manual/late.md')).toContain('Intro prose.');
      expect(rendered.get('manual/late.md')).not.toContain('# Real title');
      // A comment inside a code sample is not a title, and must survive.
      expect(rendered.get('manual/fenced.md')).toContain('title: "fenced"');
      expect(rendered.get('manual/fenced.md')).toContain('# not a title');
    }
    finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('numbers only the pages whose position the order map declares', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ecs-manual-'));
    try {
      mkdirSync(join(dir, 'getting-started'), { recursive: true });
      writeFileSync(join(dir, 'getting-started', 'first.md'), '# First\n\nBody.\n', 'utf8');
      writeFileSync(join(dir, 'getting-started', 'second.md'), '# Second\n\nBody.\n', 'utf8');

      const rendered = new Map(
        renderAuthoredPages(dir, { 'getting-started/first.md': 1 })
          .map(page => [page.outPath, page.markdown]),
      );

      expect(rendered.get('manual/getting-started/first.md')).toContain('sidebar:\n  order: 1');
      // Unnumbered pages carry no `sidebar` block, so Starlight sorts them after
      // the numbered ones rather than pinning them to an arbitrary position.
      expect(rendered.get('manual/getting-started/second.md')).not.toContain('sidebar:');
    }
    finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });
});

describe('module index', () => {
  const listed = MODULE_CATEGORIES.flatMap(category => category.modules);
  const moduleNames = pages
    .map(page => /^manual\/modules\/(.+)\.md$/.exec(page.outPath)?.[1])
    .filter((name): name is string => name !== undefined);

  it('lists every module under exactly one category', () => {
    expect([...listed].sort()).toEqual([...moduleNames].sort());
  });

  it('publishes the index with a row per module', () => {
    const index = byPath.get('manual/getting-started/module-index.md') ?? '';
    expect(index).toContain('title: "Module index"');
    expect(index).toContain('sidebar:\n  order: 1');
    for (const name of moduleNames)
      expect(index, name).toContain(`[\`${name}\`](../../modules/${name}/)`);
  });
});

describe('manual routes', () => {
  it('gives every page a distinct out path', () => {
    // An authored page placed in a group's directory would otherwise collide
    // with a generated guide and win or lose by array order.
    expect(new Set(pages.map(page => page.outPath)).size).toBe(pages.length);
  });

  it('links every Manual page only to Manual routes that exist', () => {
    // Authored pages link to published routes (`./core/world/`), not to files,
    // so these resolve against the generated page list rather than the disk.
    // Guide bodies are rewritten to routes as well, so the same rule covers
    // them. A target that leaves `manual/` is another section (the API
    // reference) and is out of scope.
    const routes = new Set(pages.map(page => routeOf(page.outPath)));
    const broken: string[] = [];

    for (const page of pages) {
      const from = routeOf(page.outPath);
      for (const match of withoutFences(page.markdown).matchAll(/\]\(([^)\s]+)\)/g)) {
        const target = match[1].split('#')[0];
        if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(target))
          continue;
        const resolved = resolveRoute(from, target);
        if (resolved.startsWith('manual/') && !routes.has(resolved))
          broken.push(`${page.outPath} -> ${match[1]}`);
      }
    }

    expect(broken).toEqual([]);
  });
});
