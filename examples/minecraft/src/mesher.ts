import type { VoxelGrid } from './voxels';

import { BLOCK_COLOR, isSolid } from './blocks';
import { CHUNK } from './game';

export interface MeshData {
  colors: Float32Array;
  indices: Uint32Array;
  positions: Float32Array;
}

// Per face: the neighbour offset, its four corners (counter-clockwise seen from outside), and a fixed shade.
const FACES: ReadonlyArray<{ corners: number[][]; dir: [number, number, number]; shade: number }> = [
  { corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], dir: [1, 0, 0], shade: 0.8 },
  { corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], dir: [-1, 0, 0], shade: 0.8 },
  { corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], dir: [0, 1, 0], shade: 1 },
  { corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], dir: [0, -1, 0], shade: 0.5 },
  { corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], dir: [0, 0, 1], shade: 0.65 },
  { corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], dir: [0, 0, -1], shade: 0.65 },
];

/** A stable ±6% brightness jitter per cell, so flat surfaces read as textured blocks. */
function jitter(x: number, y: number, z: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return 0.94 + (h - Math.floor(h)) * 0.12;
}

/** Build the exposed-face mesh for chunk `(cx, cz)`: a quad only where a solid cell meets air. */
export function meshChunk(grid: VoxelGrid, cx: number, cz: number): MeshData {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  for (let x = x0; x < x0 + CHUNK; x++) {
    for (let z = z0; z < z0 + CHUNK; z++) {
      for (let y = 0; y < grid.sy; y++) {
        const id = grid.get(x, y, z);
        if (!isSolid(id))
          continue;
        const base = BLOCK_COLOR[id] ?? 0xFF00FF;
        const j = jitter(x, y, z);
        for (const face of FACES) {
          if (isSolid(grid.get(x + face.dir[0], y + face.dir[1], z + face.dir[2])))
            continue;
          const shade = face.shade * j;
          const start = positions.length / 3;
          for (const c of face.corners) {
            positions.push(x + c[0]!, y + c[1]!, z + c[2]!);
            colors.push(((base >> 16) & 255) / 255 * shade, ((base >> 8) & 255) / 255 * shade, (base & 255) / 255 * shade);
          }
          indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
        }
      }
    }
  }
  return {
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    positions: new Float32Array(positions),
  };
}
