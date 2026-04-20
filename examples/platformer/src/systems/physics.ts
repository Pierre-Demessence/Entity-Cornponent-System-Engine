import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import {
  AabbDef,
  GroundedDef,
  PositionDef,
  StaticBodyTag,
  VelocityDef,
} from '../components';
import {
  cellsForAabb,

  GRAVITY,
  MAX_FALL_SPEED,
} from '../game';
import { aabbOverlap } from '../math';

/** Collect unique static-body IDs overlapping the cells of an AABB. */
function queryStatics(
  state: GameState,
  x: number,
  y: number,
  w: number,
  h: number,
): Set<EntityId> {
  const out = new Set<EntityId>();
  for (const c of cellsForAabb(x, y, w, h)) {
    const ids = state.grid.getAt(c.x, c.y);
    if (!ids)
      continue;
    for (const id of ids) out.add(id);
  }
  return out;
}

export const physicsSystem: SchedulableSystem<GameState> = {
  name: 'physics',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const dt = ctx.dtMs / 1000;
    const pos = ctx.world.getStore(PositionDef).get(ctx.playerId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.playerId)!;
    const aabb = ctx.world.getStore(AabbDef).get(ctx.playerId)!;
    const grounded = ctx.world.getStore(GroundedDef).get(ctx.playerId)!;
    const staticTag = ctx.world.getTag(StaticBodyTag);
    const posStore = ctx.world.getStore(PositionDef);
    const aabbStore = ctx.world.getStore(AabbDef);

    // Gravity
    vel.vy = Math.min(vel.vy + GRAVITY * dt, MAX_FALL_SPEED);

    // X axis. Evaluate every overlapping static against the ORIGINAL target
    // and take the nearest push-out so adjacent platforms don't phase through.
    const dx = vel.vx * dt;
    if (dx !== 0) {
      const origX = pos.x + dx;
      let targetX = origX;
      for (const sid of queryStatics(ctx, origX, pos.y, aabb.w, aabb.h)) {
        if (!staticTag.has(sid))
          continue;
        const sp = posStore.get(sid)!;
        const sa = aabbStore.get(sid)!;
        if (!aabbOverlap(origX, pos.y, aabb.w, aabb.h, sp.x, sp.y, sa.w, sa.h))
          continue;
        if (dx > 0)
          targetX = Math.min(targetX, sp.x - aabb.w);
        else targetX = Math.max(targetX, sp.x + sa.w);
        vel.vx = 0;
      }
      pos.x = targetX;
    }

    // Y axis. Same nearest-push-out rule; `grounded` is only reset when we
    // actually attempt a vertical move (dy===0 is unreachable under gravity
    // but the guard keeps the invariant sound).
    const dy = vel.vy * dt;
    if (dy !== 0) {
      grounded.onGround = false;
      const origY = pos.y + dy;
      let targetY = origY;
      for (const sid of queryStatics(ctx, pos.x, origY, aabb.w, aabb.h)) {
        if (!staticTag.has(sid))
          continue;
        const sp = posStore.get(sid)!;
        const sa = aabbStore.get(sid)!;
        if (!aabbOverlap(pos.x, origY, aabb.w, aabb.h, sp.x, sp.y, sa.w, sa.h))
          continue;
        if (dy > 0) {
          targetY = Math.min(targetY, sp.y - aabb.h);
          grounded.onGround = true;
        }
        else {
          targetY = Math.max(targetY, sp.y + sa.h);
        }
        vel.vy = 0;
      }
      pos.y = targetY;
    }
  },
};
