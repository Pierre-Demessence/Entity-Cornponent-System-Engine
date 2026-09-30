import type { Aabb3, Aabb3Axis } from '@pierre/ecs/modules/collision-3d';
import type { Vec3 } from '@pierre/ecs/modules/math';

import { aabb3VsAabb3Swept, rayVsAabb3 } from '@pierre/ecs/modules/collision-3d';

import { isSolid } from './blocks';

/** A dense block-id grid, `sx × sy × sz`, indexed x-major then z then y (columns are contiguous). */
export class VoxelGrid {
  readonly data: Uint8Array;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;

  constructor(sx: number, sy: number, sz: number) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
  }

  /** The block at a cell; out of bounds reads as air. */
  get(x: number, y: number, z: number): number {
    return this.inBounds(x, y, z) ? this.data[this.index(x, y, z)]! : 0;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.sx && y >= 0 && y < this.sy && z >= 0 && z < this.sz;
  }

  index(x: number, y: number, z: number): number {
    return (x * this.sz + z) * this.sy + y;
  }

  /**
   * Solidity for collision: the world's side walls and floor are solid so a
   * body cannot leave the map, while the sky above stays open.
   */
  isSolidAt(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= this.sx || z < 0 || z >= this.sz || y < 0)
      return true;
    if (y >= this.sy)
      return false;
    return isSolid(this.data[this.index(x, y, z)]!);
  }

  set(x: number, y: number, z: number, id: number): void {
    if (this.inBounds(x, y, z))
      this.data[this.index(x, y, z)] = id;
  }

  /** Y of the first air cell above the highest solid block in the column. */
  surfaceY(x: number, z: number): number {
    for (let y = this.sy - 1; y >= 0; y--) {
      if (isSolid(this.get(x, y, z)))
        return y + 1;
    }
    return 0;
  }
}

/** The world-space box of the unit cell at integer `(x, y, z)`. */
export function cellBox(x: number, y: number, z: number): Aabb3 {
  return { center: { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, half: { x: 0.5, y: 0.5, z: 0.5 } };
}

export interface SweepResult {
  hit: boolean;
  /** The motion the body may actually travel, already shortened at a contact. */
  motion: Vec3;
  /** Contact normal on the voxel that stopped the body; zero when it moved freely. */
  normal: Vec3;
}

/** Gap kept between a body and the voxel it stops against, so it never starts a sweep penetrating. */
const SKIN = 1e-3;

/**
 * Sweep `box` along `motion` (one axis at a time is the caller's job) against
 * every solid voxel the motion could reach, and return the travel allowed
 * before the first contact.
 */
export function sweepBox(grid: VoxelGrid, box: Aabb3, motion: Vec3): SweepResult {
  const min = (a: 'x' | 'y' | 'z'): number => Math.floor(Math.min(box.center[a] - box.half[a], box.center[a] - box.half[a] + motion[a]));
  const max = (a: 'x' | 'y' | 'z'): number => Math.floor(Math.max(box.center[a] + box.half[a], box.center[a] + box.half[a] + motion[a]));
  let bestT = 1;
  let normal: Vec3 = { x: 0, y: 0, z: 0 };
  let hit = false;
  for (let x = min('x'); x <= max('x'); x++) {
    for (let z = min('z'); z <= max('z'); z++) {
      for (let y = min('y'); y <= max('y'); y++) {
        if (!grid.isSolidAt(x, y, z))
          continue;
        const swept = aabb3VsAabb3Swept(box, motion, cellBox(x, y, z));
        if (swept.hit && swept.tEntry < bestT) {
          bestT = swept.tEntry;
          normal = swept.normal;
          hit = true;
        }
      }
    }
  }
  if (!hit)
    return { hit: false, motion: { ...motion }, normal };
  // Stop `SKIN` short of the contact, never reversing the motion.
  const len = Math.hypot(motion.x, motion.y, motion.z);
  const t = len > 0 ? Math.max(0, bestT - SKIN / len) : 0;
  return { hit: true, motion: { x: motion.x * t, y: motion.y * t, z: motion.z * t }, normal };
}

export interface VoxelHit {
  /** The struck solid cell. */
  cell: Vec3;
  /** Distance along the (unit) ray to the struck face. */
  distance: number;
  /** The empty cell in front of the struck face — where a placed block goes. */
  place: Vec3;
}

/**
 * The nearest solid voxel a unit-`dir` ray from `origin` strikes within
 * `reach`. Tests only the cells in the ray's bounding box; the entry axis of
 * the winning `rayVsAabb3` gives the face, hence the placement cell.
 */
export function raycastVoxels(grid: VoxelGrid, origin: Vec3, dir: Vec3, reach: number): VoxelHit | null {
  const end = { x: origin.x + dir.x * reach, y: origin.y + dir.y * reach, z: origin.z + dir.z * reach };
  let best: VoxelHit | null = null;
  for (let x = Math.floor(Math.min(origin.x, end.x)); x <= Math.floor(Math.max(origin.x, end.x)); x++) {
    for (let z = Math.floor(Math.min(origin.z, end.z)); z <= Math.floor(Math.max(origin.z, end.z)); z++) {
      for (let y = Math.floor(Math.min(origin.y, end.y)); y <= Math.floor(Math.max(origin.y, end.y)); y++) {
        if (!isSolid(grid.get(x, y, z)))
          continue;
        const hit = rayVsAabb3(origin, dir, cellBox(x, y, z));
        if (hit && hit.t <= reach && (!best || hit.t < best.distance))
          best = { cell: { x, y, z }, distance: hit.t, place: faceNeighbour({ x, y, z }, hit.axis, dir) };
      }
    }
  }
  return best;
}

function faceNeighbour(cell: Vec3, axis: Aabb3Axis, dir: Vec3): Vec3 {
  const out = { ...cell };
  out[axis] += dir[axis] > 0 ? -1 : 1;
  return out;
}
