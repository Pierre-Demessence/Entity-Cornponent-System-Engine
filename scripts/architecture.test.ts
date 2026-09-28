import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const srcDir = join(root, 'src');
const modulesDir = join(srcDir, 'modules');

/**
 * The one sanctioned core → module edge.
 *
 * `EcsWorld.enableSpatial` defaults to a fresh `HashGrid2D`, which
 * `docs/extending-the-engine.md` names as the engine's worked example of
 * "good defaults, never mandatory assumptions" — so the edge is deliberate,
 * not an oversight. It is not free: a class method cannot be tree-shaken, so
 * the default reaches every `EcsWorld` consumer's bundle whether or not it
 * enables spatial indexing. That price is paid knowingly; any *new* core →
 * module import is a layering violation.
 */
const CORE_MODULE_EDGES: readonly (readonly [file: string, specifier: string])[] = [
  ['world.ts', '#modules/spatial/hash-grid-2d'],
];

function walkTs(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory())
      found.push(...walkTs(full));
    else if (entry.name.endsWith('.ts'))
      found.push(full);
  }
  return found;
}

/**
 * Drop comments before scanning for specifiers. Prose quotes real import lines
 * (a "reach for it like this" example in JSDoc), and those must not read as
 * dependencies. Only line-leading comment blocks and line comments are removed,
 * which is how every comment in `src/` is written.
 */
function stripComments(text: string): string {
  return text
    .replaceAll(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replaceAll(/^[ \t]*\/\/[^\n]*/gm, '');
}

/** Every static import/re-export specifier in a file, in source order. */
function importSpecifiers(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\b(?:from|import)\s+'([^']+)'/g)) found.push(match[1]);
  return found;
}

/** Path of `file` relative to `src/`, always with `/` separators. */
function relFromSrc(file: string): string {
  return relative(srcDir, file).replaceAll(sep, '/');
}

/** A core primitive sits directly in `src/`; a module sits under `src/modules/`. */
function isCorePath(path: string): boolean {
  return !path.includes('/');
}

/** Every `.ts` file under `src/`, with its `src/`-relative path and specifiers. */
function sourceFiles(): { rel: string; specifiers: string[] }[] {
  return walkTs(srcDir).map(file => ({
    rel: relFromSrc(file),
    specifiers: importSpecifiers(stripComments(readFileSync(file, 'utf8'))),
  }));
}

interface SourceFile {
  rel: string;
  specifiers: string[];
}

/**
 * Rule 1 — inside the package, never import through the published package
 * specifier.
 *
 * `#index` (the internal barrel, `src/index.ts`) is deliberately *allowed* even
 * though `exports["."]` publishes that same file, because it resolves by alias
 * to one absolute path and so cannot identify a file twice; roughly fifty
 * modules use it for core types. What is forbidden is the package specifier:
 * it resolves through the `exports` map, so the same file can arrive under two
 * identities when the package is symlinked into a workspace.
 */
function packageSpecifierOffenders(files: readonly SourceFile[]): string[] {
  const offenders: string[] = [];
  for (const { rel, specifiers } of files) {
    for (const specifier of specifiers) {
      if (specifier === '@pierre/ecs' || specifier.startsWith('@pierre/ecs/'))
        offenders.push(`${rel} → ${specifier}`);
    }
  }
  return offenders;
}

/** Rule 2 — core primitives do not reach into module implementations. */
function coreModuleOffenders(files: readonly SourceFile[]): string[] {
  const allowed = new Set(CORE_MODULE_EDGES.map(([file, specifier]) => `${file}\u0000${specifier}`));
  const offenders: string[] = [];
  for (const { rel, specifiers } of files) {
    if (!isCorePath(rel))
      continue;
    for (const specifier of specifiers) {
      if (specifier.startsWith('#modules/') && !allowed.has(`${rel}\u0000${specifier}`))
        offenders.push(`${rel} → ${specifier}`);
    }
  }
  return offenders;
}

/**
 * Rule 3 — a cross-module import is documented in the importing module's
 * README.
 *
 * That is AGENTS.md's "no module imports from another module unless that
 * dependency is documented in the module's own README" — the half that applies
 * to every spelling. The barrel requirement (`#modules/<name>/index`) is
 * enforced only for the `#`-alias spelling: relative `../<name>/<file>` deep
 * imports are the older, dominant form and normalizing those is a migration,
 * not a guard.
 *
 * Test files are exempt: a test may build fixtures from any module without
 * that becoming shipped surface the README has to advertise.
 */
function siblingImportOffenders(
  files: readonly SourceFile[],
  readReadme: (owner: string) => string,
): string[] {
  const offenders: string[] = [];
  for (const { rel, specifiers } of files) {
    if (isCorePath(rel) || rel.endsWith('.test.ts'))
      continue;
    const owner = rel.split('/')[1];
    for (const specifier of specifiers) {
      const other = siblingTarget(owner, specifier);
      if (other === undefined)
        continue;
      if (specifier.startsWith('#modules/') && specifier !== `#modules/${other}/index`) {
        offenders.push(`${rel} → ${specifier} (reach the module through #modules/${other}/index)`);
        continue;
      }
      if (!new RegExp(`modules/${other}(?![\\w-])`).test(readReadme(owner)))
        offenders.push(`${rel} → ${specifier} (${other} not documented in modules/${owner}/README.md)`);
    }
  }
  return offenders;
}

/** The sibling module a specifier targets, or `undefined` if it is not one. */
function siblingTarget(owner: string, specifier: string): string | undefined {
  const match = /^#modules\/([^/]+)/.exec(specifier) ?? /^\.\.\/([^/]+)/.exec(specifier);
  const other = match?.[1];
  return other === undefined || other === owner ? undefined : other;
}

function readReadme(owner: string): string {
  const file = join(modulesDir, owner, 'README.md');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

describe('architecture boundaries', () => {
  it('src/ never imports through the published package specifier', () => {
    expect(packageSpecifierOffenders(sourceFiles())).toEqual([]);
  });

  it('core (src/*.ts) does not import module implementations', () => {
    expect(coreModuleOffenders(sourceFiles())).toEqual([]);
  });

  it('module sibling imports use the module barrel and are documented in its README', () => {
    expect(siblingImportOffenders(sourceFiles(), readReadme)).toEqual([]);
  });

  it('rule 1 catches the shape it replaced', () => {
    expect(packageSpecifierOffenders([
      { rel: 'modules/tilemap/spawn.ts', specifiers: ['@pierre/ecs', '@pierre/ecs/modules/tmx', '#index'] },
    ])).toEqual([
      'modules/tilemap/spawn.ts → @pierre/ecs',
      'modules/tilemap/spawn.ts → @pierre/ecs/modules/tmx',
    ]);
  });

  it('rule 2 allows the one documented default and catches any other core → module edge', () => {
    expect(coreModuleOffenders([{ rel: 'world.ts', specifiers: ['#modules/spatial/hash-grid-2d'] }])).toEqual([]);
    expect(coreModuleOffenders([{ rel: 'query.ts', specifiers: ['#modules/spatial/hash-grid-2d'] }]))
      .toEqual(['query.ts → #modules/spatial/hash-grid-2d']);
  });

  it('the specifier scanner reads multi-line, side-effect and re-export forms, and drops comments', () => {
    const source = [
      'import type {',
      '  A,',
      '} from \'#index\';',
      'import \'./side-effect\';',
      'export { b } from \'#modules/tmx/index\';',
      '// import { c } from \'@pierre/ecs\';',
      '/**',
      ' * import { d } from \'@pierre/ecs/modules/tmx\';',
      ' */',
    ].join('\n');
    expect(importSpecifiers(stripComments(source))).toEqual([
      '#index',
      './side-effect',
      '#modules/tmx/index',
    ]);
  });

  it('rule 3 catches a non-barrel alias import, and an undocumented sibling in either spelling', () => {
    const readme = (owner: string): string => (owner === 'tilemap' ? 'Composes with `modules/tmx`.' : '');
    expect(siblingImportOffenders([
      { rel: 'modules/tilemap/spawn.ts', specifiers: ['#modules/tmx/index'] },
      { rel: 'modules/tilemap/atlas.ts', specifiers: ['../tmx/index'] },
      { rel: 'modules/collision/trigger.test.ts', specifiers: ['../transform/position'] },
    ], readme)).toEqual([]);
    expect(siblingImportOffenders([
      { rel: 'modules/tilemap/spawn.ts', specifiers: ['#modules/tmx/tmx'] },
      { rel: 'modules/audio/audio.ts', specifiers: ['#modules/tmx/index'] },
      { rel: 'modules/audio/audio-system.ts', specifiers: ['../tmx/index'] },
    ], readme)).toEqual([
      'modules/tilemap/spawn.ts → #modules/tmx/tmx (reach the module through #modules/tmx/index)',
      'modules/audio/audio.ts → #modules/tmx/index (tmx not documented in modules/audio/README.md)',
      'modules/audio/audio-system.ts → ../tmx/index (tmx not documented in modules/audio/README.md)',
    ]);
  });
});
