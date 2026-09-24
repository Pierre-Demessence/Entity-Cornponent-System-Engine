import type { Vec2 } from '@pierre/ecs/modules/math';

import type { GuardBrain, Wall } from './game';

import { aabbVsAabb, rayVsAabb } from '@pierre/ecs/modules/collision';

import { VISION_HALF_ANGLE, VISION_RANGE } from './game';

/**
 * True if no wall blocks the straight line from `from` to `to`.
 *
 * Composed from two engine primitives rather than a bespoke segment test: a
 * zero-size AABB at the origin answers "am I standing in a wall?" (which must
 * block sight), and the ray query takes the segment vector as its direction,
 * so `t <= 1` means "crossed before reaching `to`".
 */
export function hasLineOfSight(from: Vec2, to: Vec2, walls: readonly Wall[]): boolean {
  const here = { h: 0, w: 0, x: from.x, y: from.y };
  const segment = { x: to.x - from.x, y: to.y - from.y };
  for (const w of walls) {
    if (aabbVsAabb(here, w))
      return false;
    const hit = rayVsAabb(from, segment, w);
    if (hit && hit.t <= 1)
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
