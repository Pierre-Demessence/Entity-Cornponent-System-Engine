import type { TmxLayer, TmxMap, TmxTileset } from '@pierre/ecs/modules/tmx';

import { RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { TMX_FLIP_H, TMX_FLIP_V } from '@pierre/ecs/modules/tmx';
import { PositionDef, RotationDef, ScaleDef } from '@pierre/ecs/modules/transform';
import { createTestWorld } from '@pierre/ecs/test-utils';
import { describe, expect, it } from 'vitest';

import { spawnTilemap } from './spawn';
import { tileTransform } from './tile-transform';

function makeTileset(): TmxTileset {
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
  };
}

function makeLayer(gids: number[], flags?: number[]): TmxLayer {
  return {
    name: 'layer',
    flags: flags ? Uint8Array.from(flags) : new Uint8Array(gids.length),
    gids: Uint32Array.from(gids),
    height: 1,
    offsetX: 0,
    offsetY: 0,
    opacity: 1,
    visible: true,
    width: gids.length,
  };
}

function makeMap(layers: TmxLayer[]): TmxMap {
  return {
    height: 1,
    layers,
    objectGroups: [],
    tileHeight: 16,
    tilesets: [makeTileset()],
    tileWidth: 16,
    width: layers[0]?.width ?? 0,
  };
}

function setupWorld() {
  const world = createTestWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(RenderableDef);
  world.registerComponent(RenderOrderDef);
  return world;
}

describe('spawnTilemap', () => {
  it('returns the count of spawned entities', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([1, 1, 0, 1])]);
    const count = spawnTilemap({ atlas: 'test', map, world });
    expect(count).toBe(3);
  });

  it('skips gid 0 (empty cells)', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([0, 0, 0])]);
    const count = spawnTilemap({ atlas: 'test', map, world });
    expect(count).toBe(0);
  });

  it('spawns across multiple layers', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([1]), makeLayer([2])]);
    const count = spawnTilemap({ atlas: 'test', map, world });
    expect(count).toBe(2);
  });

  it('sets top-left positions by default', () => {
    const world = setupWorld();
    // 3-tile-wide map: cols 0, 1, 2
    const map = makeMap([makeLayer([1, 1, 1])]);
    spawnTilemap({ atlas: 'test', map, world });

    const positions = world.getStore(PositionDef);
    const all = world.query(PositionDef).run();
    expect(all).toHaveLength(3);

    const xs = all.map(([id]) => positions.get(id)!.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 16, 32]);
    all.forEach(([id]) => expect(positions.get(id)!.y).toBe(0));
  });

  it('sets centre positions when anchor is center', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([1])]);
    spawnTilemap({ anchor: 'center', atlas: 'test', map, world });

    const positions = world.getStore(PositionDef);
    const id = world.query(PositionDef).run()[0]![0];
    expect(positions.get(id)).toEqual({ x: 8, y: 8 }); // half of 16
  });

  it('sets RenderOrderDef to the layer index', () => {
    const world = setupWorld();
    // Layer 0 has tile, layer 1 has tile
    const map = makeMap([makeLayer([1]), makeLayer([2])]);
    spawnTilemap({ atlas: 'test', map, world });

    const orders = world.getStore(RenderOrderDef);
    const ids = world.query(RenderOrderDef).run().map(([id]) => id);
    const layerIndices = ids.map(id => orders.get(id)!.value).sort();
    expect(layerIndices).toEqual([0, 1]);
  });

  it('resolves H flip to flipH on renderable', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([1], [TMX_FLIP_H])]);
    spawnTilemap({ atlas: 'test', map, world });

    const renderables = world.getStore(RenderableDef);
    const id = world.query(RenderableDef).run()[0]![0];
    const r = renderables.get(id)!;
    expect(r.flipH).toBe(true);
    expect(r.flipV).toBeUndefined();
  });

  it('resolves V flip to flipV on renderable', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([1], [TMX_FLIP_V])]);
    spawnTilemap({ atlas: 'test', map, world });

    const renderables = world.getStore(RenderableDef);
    const id = world.query(RenderableDef).run()[0]![0];
    expect(renderables.get(id)!.flipV).toBe(true);
    expect(renderables.get(id)!.flipH).toBeUndefined();
  });

  it('resolves H+V to both flipH and flipV', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([1], [TMX_FLIP_H | TMX_FLIP_V])]);
    spawnTilemap({ atlas: 'test', map, world });

    const renderables = world.getStore(RenderableDef);
    const id = world.query(RenderableDef).run()[0]![0];
    expect(renderables.get(id)!.flipH).toBe(true);
    expect(renderables.get(id)!.flipV).toBe(true);
  });

  it('does not set flipH/flipV when flags are 0', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([1], [0])]);
    spawnTilemap({ atlas: 'test', map, world });

    const renderables = world.getStore(RenderableDef);
    const id = world.query(RenderableDef).run()[0]![0];
    expect(renderables.get(id)!.flipH).toBeUndefined();
    expect(renderables.get(id)!.flipV).toBeUndefined();
  });

  it('calls onTile for each spawned entity', () => {
    const world = setupWorld();
    const map = makeMap([makeLayer([1, 2, 0, 3])]);

    const seen: { gid: number; flags: number; layerIndex: number }[] = [];
    spawnTilemap({
      atlas: 'test',
      map,
      world,
      onTile: (_id, gid, flags, layerIndex) => seen.push({ flags, gid, layerIndex }),
    });

    expect(seen).toHaveLength(3);
    expect(seen[0]!.gid).toBe(1);
    expect(seen[1]!.gid).toBe(2);
    expect(seen[2]!.gid).toBe(3);
    seen.forEach(s => expect(s.layerIndex).toBe(0));
  });

  it('onTile can apply D4 transforms via tileTransform', () => {
    const world = setupWorld();
    world.registerComponent(RotationDef);
    world.registerComponent(ScaleDef);

    const map = makeMap([makeLayer([1], [0])]);
    spawnTilemap({
      anchor: 'center',
      atlas: 'test',
      map,
      world,
      onTile: (id, _gid, flags) => {
        const t = tileTransform(flags);
        if (t.angle !== 0)
          world.getStore(RotationDef).set(id, { angle: t.angle });
        if (t.sx !== 1 || t.sy !== 1)
          world.getStore(ScaleDef).set(id, { x: t.sx, y: t.sy });
      },
    });

    // Identity transform — no extra components should be written
    const id = world.query(PositionDef).run()[0]![0];
    expect(world.getStore(RotationDef).get(id)).toBeUndefined();
    expect(world.getStore(ScaleDef).get(id)).toBeUndefined();
  });

  it('does not set flipH/flipV on centre-anchored tiles (consumer handles via onTile)', () => {
    const world = setupWorld();
    // H+V flips that would set both flipH and flipV for top-left anchor
    const map = makeMap([makeLayer([1], [TMX_FLIP_H | TMX_FLIP_V])]);
    spawnTilemap({ anchor: 'center', atlas: 'test', map, world });

    const renderables = world.getStore(RenderableDef);
    const id = world.query(RenderableDef).run()[0]![0];
    expect(renderables.get(id)!.flipH).toBeUndefined();
    expect(renderables.get(id)!.flipV).toBeUndefined();
  });

  it('handles a 2D grid correctly', () => {
    const world = setupWorld();
    // 2×2 map: [[1, 0], [2, 3]]
    const map = makeMap([makeLayer([1, 0, 2, 3])]);
    map.width = 2;
    map.height = 2;
    map.layers[0]!.width = 2;
    map.layers[0]!.height = 2;

    spawnTilemap({ atlas: 'test', map, world });

    const positions = world.getStore(PositionDef);
    const results = world.query(PositionDef).run();
    expect(results).toHaveLength(3);

    const coords = results.map(([id]) => positions.get(id)!);
    // (0,0)=gid1, (0,1)=gid2, (1,1)=gid3
    expect(coords).toContainEqual({ x: 0, y: 0 }); // col=0, row=0
    expect(coords).toContainEqual({ x: 0, y: 16 }); // col=0, row=1
    expect(coords).toContainEqual({ x: 16, y: 16 }); // col=1, row=1
  });
});
