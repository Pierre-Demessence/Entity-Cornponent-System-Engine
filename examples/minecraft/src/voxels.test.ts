import { describe, expect, it } from 'vitest';

import { Block } from './blocks';
import { cellBox, raycastVoxels, sweepBox, VoxelGrid } from './voxels';

function flatWorld(): VoxelGrid {
  const grid = new VoxelGrid(8, 8, 8);
  for (let x = 0; x < 8; x++) {
    for (let z = 0; z < 8; z++)
      grid.set(x, 0, z, Block.Stone);
  }
  return grid;
}

describe('voxelGrid', () => {
  it('reads out-of-bounds as air but collides with walls and floor', () => {
    const grid = flatWorld();
    expect(grid.get(-1, 0, 0)).toBe(Block.Air);
    expect(grid.isSolidAt(-1, 3, 3)).toBe(true);
    expect(grid.isSolidAt(3, -1, 3)).toBe(true);
    expect(grid.isSolidAt(3, 20, 3)).toBe(false);
  });

  it('finds the surface of a column', () => {
    const grid = flatWorld();
    grid.set(2, 1, 2, Block.Dirt);
    expect(grid.surfaceY(1, 1)).toBe(1);
    expect(grid.surfaceY(2, 2)).toBe(2);
  });
});

describe('sweepBox', () => {
  const half = { x: 0.3, y: 0.9, z: 0.3 };

  it('lets a body fall freely through air', () => {
    const grid = flatWorld();
    const result = sweepBox(grid, { center: { x: 4, y: 5, z: 4 }, half }, { x: 0, y: -1, z: 0 });
    expect(result.hit).toBe(false);
    expect(result.motion.y).toBe(-1);
  });

  it('stops a falling body on the floor with an upward normal', () => {
    const grid = flatWorld();
    const result = sweepBox(grid, { center: { x: 4, y: 2, z: 4 }, half }, { x: 0, y: -3, z: 0 });
    expect(result.hit).toBe(true);
    expect(result.normal).toEqual({ x: 0, y: 1, z: 0 });
    // Feet end just above y = 1, the floor's top face.
    expect(2 + result.motion.y - half.y).toBeGreaterThanOrEqual(1);
    expect(2 + result.motion.y - half.y).toBeLessThan(1.01);
  });

  it('is stopped by a wall block', () => {
    const grid = flatWorld();
    grid.set(5, 1, 4, Block.Stone);
    grid.set(5, 2, 4, Block.Stone);
    const result = sweepBox(grid, { center: { x: 3.5, y: 1.95, z: 4.5 }, half }, { x: 2, y: 0, z: 0 });
    expect(result.hit).toBe(true);
    expect(result.normal.x).toBe(-1);
    expect(result.motion.x).toBeLessThan(1.3);
  });
});

describe('raycastVoxels', () => {
  it('hits the nearest solid cell and names the empty cell in front of the struck face', () => {
    const grid = flatWorld();
    grid.set(4, 1, 4, Block.Dirt);
    const hit = raycastVoxels(grid, { x: 4.5, y: 4.5, z: 4.5 }, { x: 0, y: -1, z: 0 }, 6);
    expect(hit?.cell).toEqual({ x: 4, y: 1, z: 4 });
    expect(hit?.place).toEqual({ x: 4, y: 2, z: 4 });
    expect(hit?.distance).toBeCloseTo(2.5);
  });

  it('places against the side face a horizontal ray strikes', () => {
    const grid = flatWorld();
    grid.set(4, 1, 4, Block.Dirt);
    const hit = raycastVoxels(grid, { x: 1.5, y: 1.5, z: 4.5 }, { x: 1, y: 0, z: 0 }, 6);
    expect(hit?.cell).toEqual({ x: 4, y: 1, z: 4 });
    expect(hit?.place).toEqual({ x: 3, y: 1, z: 4 });
  });

  it('misses beyond reach and through open sky', () => {
    const grid = flatWorld();
    expect(raycastVoxels(grid, { x: 4.5, y: 7.5, z: 4.5 }, { x: 0, y: -1, z: 0 }, 3)).toBeNull();
    expect(raycastVoxels(grid, { x: 4.5, y: 4.5, z: 4.5 }, { x: 0, y: 1, z: 0 }, 6)).toBeNull();
  });

  it('agrees with cellBox on which cell it struck', () => {
    expect(cellBox(2, 3, 4).center).toEqual({ x: 2.5, y: 3.5, z: 4.5 });
  });
});
