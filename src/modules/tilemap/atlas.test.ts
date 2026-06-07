import type { TmxLayer, TmxMap, TmxTileset } from '@pierre/ecs/modules/tmx';

import { describe, expect, it } from 'vitest';

import { buildTilemapAtlas } from './atlas';

function makeTileset(overrides?: Partial<TmxTileset>): TmxTileset {
  return {
    name: 'test',
    columns: 4,
    firstgid: 1,
    imageHeight: 64,
    imageSource: 'sheet.png',
    imageWidth: 64,
    margin: 0,
    spacing: 0,
    tileHeight: 16,
    tileWidth: 16,
    ...overrides,
  };
}

function makeLayer(gids: number[]): TmxLayer {
  return {
    name: 'layer',
    flags: new Uint8Array(gids.length),
    gids: Uint32Array.from(gids),
    height: 1,
    offsetX: 0,
    offsetY: 0,
    opacity: 1,
    visible: true,
    width: gids.length,
  };
}

function makeMap(layers: TmxLayer[], tilesets: TmxTileset[]): TmxMap {
  return {
    height: 1,
    layers,
    objectGroups: [],
    tileHeight: 16,
    tilesets,
    tileWidth: 16,
    width: layers[0]?.width ?? 0,
  };
}

describe('buildTilemapAtlas', () => {
  it('returns a TextureAtlasRegistry with the given name', () => {
    const ts = makeTileset();
    const map = makeMap([makeLayer([1])], [ts]);
    // Use a 1×1 canvas as the image — just need a valid CanvasImageSource
    const image = document.createElement('canvas');
    image.width = 1;
    image.height = 1;

    const atlas = buildTilemapAtlas({ name: 'dungeon', image, map });
    const resolved = atlas.getFrame('dungeon', '1');
    expect(resolved).toBeDefined();
    expect(resolved!.image).toBe(image);
  });

  it('registers each unique GID once', () => {
    const ts = makeTileset();
    // GID 1 appears twice, GID 2 appears once
    const map = makeMap([makeLayer([1, 1, 2, 1])], [ts]);
    const image = document.createElement('canvas');

    const atlas = buildTilemapAtlas({ name: 'a', image, map });
    // Both GIDs should resolve
    expect(atlas.getFrame('a', '1')).toBeDefined();
    expect(atlas.getFrame('a', '2')).toBeDefined();
  });

  it('skips gid 0 (empty cells)', () => {
    const ts = makeTileset();
    const map = makeMap([makeLayer([0, 1, 0])], [ts]);
    const image = document.createElement('canvas');

    const atlas = buildTilemapAtlas({ name: 'a', image, map });
    expect(atlas.getFrame('a', '0')).toBeUndefined();
    expect(atlas.getFrame('a', '1')).toBeDefined();
  });

  it('collects GIDs across all layers', () => {
    const ts = makeTileset();
    const map = makeMap([makeLayer([1]), makeLayer([2])], [ts]);
    const image = document.createElement('canvas');

    const atlas = buildTilemapAtlas({ name: 'a', image, map });
    expect(atlas.getFrame('a', '1')).toBeDefined();
    expect(atlas.getFrame('a', '2')).toBeDefined();
  });

  it('resolves frame rectangles via gidToFrame', () => {
    const ts = makeTileset({ columns: 4, margin: 0, spacing: 0, tileHeight: 16, tileWidth: 16 });
    const map = makeMap([makeLayer([1, 5])], [ts]);
    const image = document.createElement('canvas');

    const atlas = buildTilemapAtlas({ name: 'a', image, map });
    // GID 1 → local 0 → col 0, row 0 → { x: 0, y: 0, w: 16, h: 16 }
    expect(atlas.getFrame('a', '1')).toMatchObject({ sh: 16, sw: 16, sx: 0, sy: 0 });
    // GID 5 → local 4 → col 0, row 1 → { x: 0, y: 16, w: 16, h: 16 }
    expect(atlas.getFrame('a', '5')).toMatchObject({ sh: 16, sw: 16, sx: 0, sy: 16 });
  });
});
