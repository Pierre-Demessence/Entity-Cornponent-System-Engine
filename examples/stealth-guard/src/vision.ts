import type { Vec2 } from '@pierre/ecs/modules/motion';

import type { GuardBrain, Wall } from './game';

import { VISION_HALF_ANGLE, VISION_RANGE } from './game';

/**
 * Liang–Barsky segment-vs-AABB test: does the segment `a→b` cross `r`?
 * Used for line-of-sight — a wall between guard and player blocks sight.
 */
function segmentHitsRect(ax: number, ay: number, bx: number, by: number, r: Wall): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0)
        return false; // parallel and outside this slab
    }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1)
          return false;
        if (t > t0)
          t0 = t;
      }
      else {
        if (t < t0)
          return false;
        if (t < t1)
          t1 = t;
      }
    }
  }
  return true;
}

/** True if no wall blocks the straight line from `from` to `to`. */
export function hasLineOfSight(from: Vec2, to: Vec2, walls: readonly Wall[]): boolean {
  for (const w of walls) {
    if (segmentHitsRect(from.x, from.y, to.x, to.y, w))
      return false;
  }
  return true;
}

/**
 * Can the guard see the player this tick? Requires range, a within-cone
 * angle relative to `facing`, and clear line-of-sight past walls.
 */
export function guardSeesPlayer(guard: GuardBrain, guardPos: Vec2, player: Vec2, walls: readonly Wall[]): boolean {
  const dx = player.x - guardPos.x;
  const dy = player.y - guardPos.y;
  const dist = Math.hypot(dx, dy);
  if (dist > VISION_RANGE || dist < 1e-3)
    return false;
  const toPlayer = Math.atan2(dy, dx);
  let delta = Math.abs(toPlayer - guard.facing);
  if (delta > Math.PI)
    delta = Math.PI * 2 - delta;
  if (delta > VISION_HALF_ANGLE)
    return false;
  return hasLineOfSight(guardPos, player, walls);
}
