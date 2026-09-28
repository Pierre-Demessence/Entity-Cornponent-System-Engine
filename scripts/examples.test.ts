import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { EXAMPLE_GROUPS, EXAMPLES } from '../examples/manifest';
import { renderExamplePages } from './examples';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const examplesDir = join(root, 'examples');
const PACKAGE_PREFIX = '@pierre/ecs-example-';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
}

/** Ids of every `examples/<dir>` whose package is a prototype (not the hub). */
function prototypeDirs(): string[] {
  return readdirSync(examplesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter((entry) => {
      const pkg = join(examplesDir, entry.name, 'package.json');
      return existsSync(pkg) && (readJson(pkg).name ?? '').startsWith(PACKAGE_PREFIX);
    })
    .map(entry => entry.name)
    .sort();
}

function walkTs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory())
      return walkTs(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

function importedModules(id: string): string[] {
  const found = new Set<string>();
  for (const file of walkTs(join(examplesDir, id, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/@pierre\/ecs\/modules\/([\w-]+)/g))
      found.add(match[1]!);
  }
  return [...found].sort();
}

/**
 * `id -> package id` for each literal loader. Read as text: importing
 * `loaders.ts` would put every prototype's DOM-dependent source into the
 * Node-only program `tsconfig.node.json` checks (the hub's typecheck is what
 * checks the record itself).
 */
function loaderTargets(): Record<string, string> {
  const source = readFileSync(join(examplesDir, 'loaders.ts'), 'utf8');
  const found: Record<string, string> = {};
  for (const match of source.matchAll(/^\s*'?([\w-]+)'?: \(\) => import\('@pierre\/ecs-example-([\w-]+)\/src\/main\.ts'\),$/gm))
    found[match[1]!] = match[2]!;
  return found;
}

const ids = EXAMPLES.map(entry => entry.id);

describe('examples manifest', () => {
  it('lists every prototype directory exactly once', () => {
    expect([...ids].sort()).toEqual(prototypeDirs());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names each prototype package after its directory', () => {
    for (const id of ids)
      expect(readJson(join(examplesDir, id, 'package.json')).name, id).toBe(`${PACKAGE_PREFIX}${id}`);
  });

  it('has a loader for every entry and no loader without an entry', () => {
    const targets = loaderTargets();
    expect(Object.keys(targets).sort()).toEqual([...ids].sort());
    for (const [id, target] of Object.entries(targets))
      expect(target, id).toBe(id);
  });

  it('is what the hub depends on', () => {
    const deps = Object.keys(readJson(join(examplesDir, 'hub/package.json')).dependencies ?? {})
      .filter(name => name.startsWith(PACKAGE_PREFIX))
      .map(name => name.slice(PACKAGE_PREFIX.length))
      .sort();
    expect(deps).toEqual([...ids].sort());
  });

  it('names only modules that exist, and exactly the ones the prototype imports', () => {
    for (const entry of EXAMPLES) {
      for (const name of entry.modules)
        expect(existsSync(join(root, 'src/modules', name, 'index.ts')), `${entry.id}: ${name}`).toBe(true);
      expect([...entry.modules].sort(), entry.id).toEqual(importedModules(entry.id));
    }
  });

  it('puts every entry in a declared group, with the rung only on challenge games', () => {
    const groups = new Set<string>(EXAMPLE_GROUPS.map(group => group.id));
    for (const entry of EXAMPLES) {
      expect(groups.has(entry.group), entry.id).toBe(true);
      expect('challenge' in entry, entry.id).toBe(entry.group === 'challenge');
    }
  });

  it('keeps the challenge games in rung order', () => {
    const rungs = EXAMPLES.flatMap(entry => 'challenge' in entry ? [entry.challenge] : []);
    expect(rungs).toEqual([...rungs].sort((a, b) => a - b));
  });
});

describe('examples pages', () => {
  const pages = renderExamplePages();
  const byPath = new Map(pages.map(page => [page.outPath, page.markdown]));

  it('emits the overview and exactly one page per manifest entry', () => {
    expect(pages).toHaveLength(EXAMPLES.length + 1);
    expect(byPath.has('examples/index.mdx')).toBe(true);
    for (const id of ids)
      expect(byPath.has(`examples/${id}.mdx`), id).toBe(true);
  });

  it('mounts each prototype by its own id and links its source folder', () => {
    for (const id of ids) {
      const page = byPath.get(`examples/${id}.mdx`)!;
      expect(page, id).toContain(`<ExampleStage id="${id}" />`);
      expect(page, id).toContain(`/tree/main/examples/${id})`);
    }
  });

  it('states the summary, controls and every module a prototype exercises', () => {
    for (const entry of EXAMPLES) {
      const page = byPath.get(`examples/${entry.id}.mdx`)!;
      expect(page, entry.id).toContain(entry.summary);
      expect(page, entry.id).toContain(`**Controls:** ${entry.controls}`);
      for (const name of entry.modules)
        expect(page, `${entry.id}: ${name}`).toContain(`\`${name}\``);
    }
  });

  it('links a module to its Manual guide only when the guide exists', () => {
    const snake = byPath.get('examples/snake.mdx')!;
    expect(snake).toContain('[`input`](../../manual/modules/input/)');
  });

  it('carries the isolation caveat, and the challenge rung, only where the manifest does', () => {
    for (const entry of EXAMPLES) {
      const page = byPath.get(`examples/${entry.id}.mdx`)!;
      expect(page.includes('Cross-origin isolation'), entry.id).toBe('isolation' in entry);
      expect(page.includes('20 Games Challenge'), entry.id).toBe('challenge' in entry);
    }
  });

  it('lists every prototype on the overview, under its group', () => {
    const overview = byPath.get('examples/index.mdx')!;
    for (const group of EXAMPLE_GROUPS)
      expect(overview).toContain(`## ${group.title}`);
    for (const id of ids)
      expect(overview, id).toContain(`(./${id}/)`);
  });

  it('quotes frontmatter so summary punctuation stays inert', () => {
    for (const page of pages)
      expect(page.markdown.startsWith('---\ntitle: "')).toBe(true);
  });
});
