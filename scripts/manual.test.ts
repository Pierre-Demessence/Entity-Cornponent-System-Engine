/**
 * Guards the Manual renderer's contract: every module README becomes a guide
 * page, links are rewritten for the published site, internal docs are never
 * linked, and the output is byte-stable across runs.
 */
import { describe, expect, it } from 'vitest';

import { renderManualPages } from './manual';

const pages = renderManualPages();
const byPath = new Map(pages.map(page => [page.outPath, page.html]));
const allHtml = pages.map(page => page.html).join('\n');

function pageFor(name: string): string {
  return byPath.get(`manual/${name}.html`) ?? '';
}

describe('manual renderer', () => {
  it('writes an index and a page per module guide', () => {
    expect(byPath.has('manual/index.html')).toBe(true);
    expect(byPath.has('manual/behavior-tree.html')).toBe(true);
    expect(pages.length).toBeGreaterThan(40);
  });

  it('never links into the internal docs tree', () => {
    const internal = [...allHtml.matchAll(/href="([^"]*docs\/[^"]*)"/g)]
      .map(match => match[1])
      .filter(href => !/^https?:/.test(href));
    expect(internal).toEqual([]);
  });

  it('rewrites cross-module README links to sibling guide pages', () => {
    const crossLinks = [...allHtml.matchAll(/href="\.\/[a-z0-9-]+\.html"/g)];
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
    const index = pageFor('index');
    expect(index).toContain('bevy_pathfinding');
    expect(index).toContain('A* pathfinding');
  });

  it('is byte-stable across runs', () => {
    expect(JSON.stringify(renderManualPages())).toBe(JSON.stringify(pages));
  });
});
