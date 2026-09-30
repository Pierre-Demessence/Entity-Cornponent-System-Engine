import { describe, expect, it } from 'vitest';

import { Block } from './blocks';
import { VoxelGrid } from './voxels';
import { generateTerrain, heightAt, SEA_LEVEL } from './worldgen';

function generate(seed: number): VoxelGrid {
  const grid = new VoxelGrid(48, 48, 48);
  generateTerrain(grid, seed);
  return grid;
}

describe('heightAt', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(heightAt(10, 20, 5)).toBe(heightAt(10, 20, 5));
    expect(heightAt(10, 20, 5)).not.toBe(heightAt(10, 20, 6));
  });

  it('stays within a playable band around sea level', () => {
    for (let x = 0; x < 200; x += 7) {
      for (let z = 0; z < 200; z += 7) {
        const h = heightAt(x, z, 1337);
        expect(h).toBeGreaterThan(SEA_LEVEL - 20);
        expect(h).toBeLessThan(46);
      }
    }
  });
});

describe('generateTerrain', () => {
  it('is deterministic for a seed', () => {
    expect(generate(3).data).toEqual(generate(3).data);
    expect(generate(3).data).not.toEqual(generate(4).data);
  });

  it('fills the floor and leaves the top open', () => {
    const grid = generate(1337);
    for (let x = 0; x < 48; x += 6) {
      for (let z = 0; z < 48; z += 6) {
        expect(grid.get(x, 0, z)).not.toBe(Block.Air);
        expect(grid.get(x, 47, z)).toBe(Block.Air);
      }
    }
  });

  it('dresses the surface with grass, dirt and stone, and plants trees', () => {
    const counts = new Map<number, number>();
    for (const id of generate(1337).data)
      counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const id of [Block.Grass, Block.Dirt, Block.Stone, Block.Wood, Block.Leaves])
      expect(counts.get(id) ?? 0).toBeGreaterThan(0);
  });

  it('carves caves: some air sits below a solid cell', () => {
    const grid = generate(1337);
    let buried = 0;
    for (let x = 0; x < 48; x++) {
      for (let z = 0; z < 48; z++) {
        for (let y = 3; y < grid.surfaceY(x, z) - 2; y++) {
          if (grid.get(x, y, z) === Block.Air)
            buried += 1;
        }
      }
    }
    expect(buried).toBeGreaterThan(0);
  });
});
