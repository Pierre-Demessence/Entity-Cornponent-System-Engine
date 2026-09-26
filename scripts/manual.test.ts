/**
 * Guards the Manual generator's contract: every module README becomes a page,
 * links are rewritten for the published site, internal docs are never linked,
 * and the output is byte-stable.
 */
import { describe, expect, it } from 'vitest';

import { renderManualPages, summaryOf } from './manual';

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

  it('is byte-stable across runs', () => {
    expect(JSON.stringify(renderManualPages())).toBe(JSON.stringify(pages));
  });
});
