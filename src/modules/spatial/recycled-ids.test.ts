import type { ComponentDef } from '#component-store';
import type { SpatialStructure } from '#spatial-structure';

import { describe, expect, it } from 'vitest';

import { entityIndex } from '#entity-id';
import { EcsWorld } from '#world';

import { HashGrid2D } from './hash-grid-2d';
import { HashGrid3D } from './hash-grid-3d';

interface P3 { x: number; y: number; z: number }

const PosDef: ComponentDef<P3> = { name: 'pos', deserialize: raw => raw as P3, serialize: v => v };

const grids: [string, () => SpatialStructure<P3>][] = [
  ['HashGrid2D', () => new HashGrid2D()],
  ['HashGrid3D', () => new HashGrid3D({ cellSize: 1 })],
];

describe.each(grids)('%s with recycled entity ids', (_name, make) => {
  function setup() {
    const world = new EcsWorld();
    world.registerComponent(PosDef);
    const grid = world.enableSpatial(PosDef, make());
    const stale = world.spawn({ name: 'a', components: { pos: { x: 1, y: 1, z: 0 } } });
    world.destroyEntity(stale);
    const current = world.spawn({ name: 'b', components: { pos: { x: 5, y: 5, z: 0 } } });
    return { current, grid, stale, world };
  }

  it('indexes only the new occupant of a reused index', () => {
    const { current, grid, stale } = setup();
    expect(entityIndex(current)).toBe(entityIndex(stale));
    expect([...grid.queryAt({ x: 1, y: 1, z: 0 })]).toEqual([]);
    expect([...grid.queryAt({ x: 5, y: 5, z: 0 })]).toEqual([current]);
  });

  it('move through a stale id leaves the new occupant in place', () => {
    const { current, grid, stale, world } = setup();
    world.move(PosDef, stale, { x: 9, y: 9, z: 0 });
    expect([...grid.queryAt({ x: 5, y: 5, z: 0 })]).toEqual([current]);
    expect([...grid.queryAt({ x: 9, y: 9, z: 0 })]).toEqual([]);
    expect(world.getStore(PosDef).get(current)).toEqual({ x: 5, y: 5, z: 0 });
  });
});
