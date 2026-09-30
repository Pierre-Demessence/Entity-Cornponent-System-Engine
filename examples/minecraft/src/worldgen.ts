import type { VoxelGrid } from './voxels';

import { fbm2D, fbm3D, perlin2D, simplex3D, valueNoise2D } from '@pierre/ecs/modules/noise';
import { makeSeededRng } from '@pierre/ecs/modules/rng';

import { Block } from './blocks';

export const SEA_LEVEL = 14;
const CAVE_THRESHOLD = 0.62;
const TREE_CHANCE = 0.012;

/** Terrain surface height at a column: fractal hills, a broad biome mask lifting mountains, fine perlin detail. */
export function heightAt(x: number, z: number, seed: number): number {
  const hills = fbm2D(x * 0.018, z * 0.018, { octaves: 4, seed });
  const mountains = Math.max(0, valueNoise2D(x * 0.008, z * 0.008, seed + 101) - 0.45) * 2.2;
  const detail = perlin2D(x * 0.12, z * 0.12, seed + 7);
  return SEA_LEVEL + hills * 9 + mountains * 14 + detail * 1.2;
}

/**
 * Fill `grid` from `seed`: a 3D density (height gradient plus `fbm3D`) carves
 * overhangs, `simplex3D` tunnels caves under the surface, then grass, dirt,
 * sand shores and seeded trees are laid on top. Deterministic per seed.
 */
export function generateTerrain(grid: VoxelGrid, seed: number): void {
  for (let x = 0; x < grid.sx; x++) {
    for (let z = 0; z < grid.sz; z++) {
      const h = heightAt(x, z, seed);
      for (let y = 0; y < grid.sy; y++) {
        const overhang = fbm3D(x * 0.04, y * 0.06, z * 0.04, { octaves: 3, seed: seed + 31 });
        const density = (h - y) / 6 + overhang * 0.7;
        if (density <= 0 && y > 0)
          continue;
        const cave = y > 2 && y < h - 3 && simplex3D(x * 0.07, y * 0.1, z * 0.07, seed + 57) > CAVE_THRESHOLD;
        if (!cave)
          grid.set(x, y, z, Block.Stone);
      }
    }
  }
  dressSurface(grid);
  plantTrees(grid, seed);
}

/** Turn the top of every column into grass (dirt beneath) or sand near sea level. */
function dressSurface(grid: VoxelGrid): void {
  for (let x = 0; x < grid.sx; x++) {
    for (let z = 0; z < grid.sz; z++) {
      const top = grid.surfaceY(x, z) - 1;
      if (top < 1 || grid.get(x, top, z) !== Block.Stone)
        continue;
      if (top <= SEA_LEVEL - 3) {
        grid.set(x, top, z, Block.Sand);
        continue;
      }
      // Only stone that sees the sky becomes grass; high peaks stay bare.
      if (top < SEA_LEVEL + 15) {
        grid.set(x, top, z, Block.Grass);
        for (let d = 1; d <= 3; d++) {
          if (grid.get(x, top - d, z) === Block.Stone)
            grid.set(x, top - d, z, Block.Dirt);
        }
      }
    }
  }
}

function plantTrees(grid: VoxelGrid, seed: number): void {
  const rng = makeSeededRng(seed + 999);
  for (let x = 3; x < grid.sx - 3; x++) {
    for (let z = 3; z < grid.sz - 3; z++) {
      if (rng() >= TREE_CHANCE)
        continue;
      const top = grid.surfaceY(x, z) - 1;
      if (grid.get(x, top, z) !== Block.Grass || top + 8 >= grid.sy)
        continue;
      const trunk = 4 + Math.floor(rng() * 2);
      for (let y = 1; y <= trunk; y++)
        grid.set(x, top + y, z, Block.Wood);
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = trunk - 1; dy <= trunk + 1; dy++) {
            const reach = Math.abs(dx) + Math.abs(dz) + (dy === trunk + 1 ? 1 : 0);
            if (reach <= 3 && grid.get(x + dx, top + dy, z + dz) === Block.Air)
              grid.set(x + dx, top + dy, z + dz, Block.Leaves);
          }
        }
      }
    }
  }
}
