import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import {
  GroundedDef,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from '../components';
import { GRAVITY, MAX_FALL_SPEED } from '../game';

/**
 * 3D kinematic body resolution: gravity → X sweep → Z sweep → Y sweep.
 * Penetration-based axis-separated push-out; mirrors the 2D kinematics
 * module's behavior. Axis order is X→Z→Y so that horizontal wall
 * contact does not cancel a jump on the same tick.
 *
 * Brute-force iteration over `StaticBodyTag` — the level has ~7 statics
 * and a proper broadphase would be roadmap work, not example work.
 */
export const kinematics3dSystem: SchedulableSystem<GameState> = {
  name: 'kinematics3d',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.playerId == null)
      return;

    const dt = ctx.dtMs / 1000;
    const pos = ctx.world.getStore(Position3DDef).get(ctx.playerId)!;
    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId)!;
    const aabb = ctx.world.getStore(ShapeAabb3DDef).get(ctx.playerId)!;
    const grounded = ctx.world.getStore(GroundedDef).get(ctx.playerId)!;

    // Gravity + terminal velocity. Gravity is subtracted because +Y is up.
    vel.vy -= GRAVITY * dt;
    if (vel.vy < -MAX_FALL_SPEED)
      vel.vy = -MAX_FALL_SPEED;

    const staticIds: EntityId[] = [...ctx.world.getTag(StaticBodyTag)];

    // X axis
    pos.x += vel.vx * dt;
    resolveAxis(ctx, ctx.playerId, pos, aabb, staticIds, 'x', vel);

    // Z axis
    pos.z += vel.vz * dt;
    resolveAxis(ctx, ctx.playerId, pos, aabb, staticIds, 'z', vel);

    // Y axis: also updates `onGround`.
    grounded.onGround = false;
    pos.y += vel.vy * dt;
    resolveAxis(ctx, ctx.playerId, pos, aabb, staticIds, 'y', vel, grounded);
  },
};

interface Vec3 { x: number; y: number; z: number }
interface Box3 { d: number; h: number; w: number }

function resolveAxis(
  ctx: GameState,
  _id: EntityId,
  pos: Vec3,
  aabb: Box3,
  staticIds: EntityId[],
  axis: 'x' | 'y' | 'z',
  vel: { vx: number; vy: number; vz: number },
  grounded?: { onGround: boolean },
): void {
  const posStore = ctx.world.getStore(Position3DDef);
  const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
  const halfW = aabb.w / 2;
  const halfH = aabb.h / 2;
  const halfD = aabb.d / 2;

  for (const sid of staticIds) {
    const sp = posStore.get(sid);
    const sb = aabbStore.get(sid);
    if (!sp || !sb)
      continue;

    const shW = sb.w / 2;
    const shH = sb.h / 2;
    const shD = sb.d / 2;

    // AABB-vs-AABB (center-based)
    const overlapX = halfW + shW - Math.abs(pos.x - sp.x);
    const overlapY = halfH + shH - Math.abs(pos.y - sp.y);
    const overlapZ = halfD + shD - Math.abs(pos.z - sp.z);
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0)
      continue;

    if (axis === 'x') {
      if (pos.x < sp.x)
        pos.x -= overlapX;
      else pos.x += overlapX;
      vel.vx = 0;
    }
    else if (axis === 'z') {
      if (pos.z < sp.z)
        pos.z -= overlapZ;
      else pos.z += overlapZ;
      vel.vz = 0;
    }
    else {
      if (pos.y < sp.y) {
        pos.y -= overlapY;
      }
      else {
        pos.y += overlapY;
        if (grounded)
          grounded.onGround = true;
      }
      vel.vy = 0;
    }
  }
}
