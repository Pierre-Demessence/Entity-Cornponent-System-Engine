import type { ComponentDef } from '#component-store';

import { describe, expect, it } from 'vitest';

import { EcsWorld } from '#world';

import { HashGrid3D } from './hash-grid-3d';

const sorted = (ids: Iterable<number>): number[] => [...ids].sort((a, b) => a - b);

describe('hashGrid3D', () => {
  it('rejects a non-positive cell size', () => {
    expect(() => new HashGrid3D({ cellSize: 0 })).toThrow(RangeError);
    expect(() => new HashGrid3D({ cellSize: Number.NaN })).toThrow(RangeError);
  });

  it('queryAt returns the entities in the cell containing the position', () => {
    const grid = new HashGrid3D({ cellSize: 2 });
    grid.add(1, { x: 0.5, y: 0.5, z: 0.5 });
    grid.add(2, { x: 1.9, y: 1.9, z: 1.9 });
    grid.add(3, { x: 2, y: 0, z: 0 });
    grid.add(4, { x: -0.1, y: 0, z: 0 });
    expect(sorted(grid.queryAt({ x: 1, y: 1, z: 1 }))).toEqual([1, 2]);
    expect(sorted(grid.queryAt({ x: 3, y: 1, z: 1 }))).toEqual([3]);
    expect(sorted(grid.queryAt({ x: -1, y: 1, z: 1 }))).toEqual([4]);
  });

  it('queryNear is exact and inclusive', () => {
    const grid = new HashGrid3D({ cellSize: 1 });
    grid.add(1, { x: 0, y: 0, z: 0 });
    grid.add(2, { x: 3, y: 4, z: 0 });
    grid.add(3, { x: 3, y: 4, z: 0.01 });
    grid.add(4, { x: 1, y: 1, z: 1 });
    expect(sorted(grid.queryNear({ x: 0, y: 0, z: 0 }, 5))).toEqual([1, 2, 4]);
    expect(sorted(grid.queryNear({ x: 0, y: 0, z: 0 }, 1.5))).toEqual([1]);
    expect([...grid.queryNear({ x: 0, y: 0, z: 0 }, -1)]).toEqual([]);
  });

  it('queryRect is exact and inclusive', () => {
    const grid = new HashGrid3D({ cellSize: 4 });
    grid.add(1, { x: 1, y: 1, z: 1 });
    grid.add(2, { x: 2, y: 2, z: 2 });
    grid.add(3, { x: 2.5, y: 2, z: 2 });
    expect(sorted(grid.queryRect({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }))).toEqual([1, 2]);
    expect([...grid.queryRect({ x: 3, y: 0, z: 0 }, { x: 0, y: 1, z: 1 })]).toEqual([]);
  });

  it('answers a query far larger than the population by scanning stored positions', () => {
    const grid = new HashGrid3D({ cellSize: 0.01 });
    grid.add(1, { x: -400, y: 0, z: 0 });
    grid.add(2, { x: 400, y: 0, z: 0 });
    expect(sorted(grid.queryNear({ x: 0, y: 0, z: 0 }, 1000))).toEqual([1, 2]);
  });

  it('keeps one position per entity across add, move and remove', () => {
    const grid = new HashGrid3D();
    grid.add(1, { x: 0, y: 0, z: 0 });
    grid.add(1, { x: 5, y: 5, z: 5 });
    expect([...grid.queryAt({ x: 0, y: 0, z: 0 })]).toEqual([]);
    expect(grid.size).toBe(1);

    grid.move(1, { x: 999, y: 999, z: 999 }, { x: 9, y: 9, z: 9 });
    expect([...grid.queryAt({ x: 5, y: 5, z: 5 })]).toEqual([]);
    expect(grid.positionOf(1)).toEqual({ x: 9, y: 9, z: 9 });

    grid.remove(1, { x: 0, y: 0, z: 0 });
    expect(grid.has(1)).toBe(false);
    expect([...grid.queryAt({ x: 9, y: 9, z: 9 })]).toEqual([]);
  });

  it('copies positions instead of holding the caller object', () => {
    const grid = new HashGrid3D();
    const pos = { x: 0, y: 0, z: 0 };
    grid.add(1, pos);
    pos.x = 50;
    expect(grid.positionOf(1)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('clear empties the grid', () => {
    const grid = new HashGrid3D();
    grid.add(1, { x: 0, y: 0, z: 0 });
    grid.clear();
    expect(grid.size).toBe(0);
    expect([...grid.queryNear({ x: 0, y: 0, z: 0 }, 10)]).toEqual([]);
  });

  it('indexes a 3D component through world.enableSpatial and world.move', () => {
    interface P3 { x: number; y: number; z: number }
    const P3Def: ComponentDef<P3> = { name: 'p3', deserialize: raw => raw as P3, serialize: v => v };
    const world = new EcsWorld();
    const store = world.registerComponent(P3Def);
    const grid = world.enableSpatial(P3Def, new HashGrid3D({ cellSize: 2 }));
    const id = world.createEntity();
    store.set(id, { x: 1, y: 1, z: 1 });
    world.move(P3Def, id, { x: 10, y: 1, z: 1 });
    expect([...grid.queryNear({ x: 1, y: 1, z: 1 }, 1)]).toEqual([]);
    expect([...grid.queryNear({ x: 10, y: 1, z: 1 }, 0)]).toEqual([id]);
  });
});
