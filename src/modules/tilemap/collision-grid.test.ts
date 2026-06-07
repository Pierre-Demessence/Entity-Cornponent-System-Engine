import type { TmxLayer, TmxMap } from '@pierre/ecs/modules/tmx';

import { describe, expect, it } from 'vitest';

import { buildCollisionGrid } from './collision-grid';

function layer(gids: number[]): TmxLayer {
  return {
    name: 'ground',
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

function map(layers: TmxLayer[]): TmxMap {
  return {
    height: 1,
    layers,
    objectGroups: [],
    tileHeight: 16,
    tilesets: [],
    tileWidth: 16,
    width: layers[0]?.width ?? 0,
  };
}

const FLOOR = new Set([1, 2]);
const PROP = new Set([10]);

describe('buildCollisionGrid', () => {
  it('marks a cell walkable when its ground GID is in floorGids', () => {
    const grid = buildCollisionGrid(map([layer([1])]), { floorGids: FLOOR, walkablePropGids: PROP });
    expect(grid.solid[0]).toBe(0);
  });

  it('marks a cell solid when its ground GID is not in floorGids', () => {
    const grid = buildCollisionGrid(map([layer([99])]), { floorGids: FLOOR, walkablePropGids: PROP });
    expect(grid.solid[0]).toBe(1);
  });

  it('marks a cell solid when ground GID is 0 (empty)', () => {
    const grid = buildCollisionGrid(map([layer([0])]), { floorGids: FLOOR, walkablePropGids: PROP });
    expect(grid.solid[0]).toBe(1);
  });

  it('stays walkable when upper-layer tiles are in walkablePropGids', () => {
    const grid = buildCollisionGrid(map([layer([1]), layer([10])]), {
      floorGids: FLOOR,
      walkablePropGids: PROP,
    });
    expect(grid.solid[0]).toBe(0);
  });

  it('stays walkable when upper-layer tiles are empty (gid 0)', () => {
    const grid = buildCollisionGrid(map([layer([1]), layer([0])]), {
      floorGids: FLOOR,
      walkablePropGids: PROP,
    });
    expect(grid.solid[0]).toBe(0);
  });

  it('becomes solid when any upper-layer tile is a non-prop, non-empty GID', () => {
    const grid = buildCollisionGrid(map([layer([1]), layer([99])]), {
      floorGids: FLOOR,
      walkablePropGids: PROP,
    });
    expect(grid.solid[0]).toBe(1);
  });

  it('returns correct dimensions', () => {
    const grid = buildCollisionGrid(map([layer([1, 2, 0, 99])]), {
      floorGids: FLOOR,
      walkablePropGids: PROP,
    });
    expect(grid.width).toBe(4);
    expect(grid.height).toBe(1);
    expect(grid.solid.length).toBe(4);
  });

  it('handles multiple cells independently', () => {
    // [walkable, solid (bad ground), walkable+prop, solid (blocking upper)]
    const grid = buildCollisionGrid(map([layer([1, 99, 2, 1]), layer([0, 0, 10, 99])]), {
      floorGids: FLOOR,
      walkablePropGids: PROP,
    });
    expect(grid.solid[0]).toBe(0); // walkable ground
    expect(grid.solid[1]).toBe(1); // bad ground
    expect(grid.solid[2]).toBe(0); // walkable ground + walkable prop
    expect(grid.solid[3]).toBe(1); // walkable ground + solid upper
  });
});
