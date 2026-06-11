import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import {
  DynamicBodyTag,
  GroundedDef,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from '../components';
import { GRAVITY, MAX_FALL_SPEED, STEP_HEIGHT } from '../game';

interface Vec3 { x: number; y: number; z: number }
interface Box3 { d: number; h: number; w: number }
interface Vel3 { vx: number; vy: number; vz: number }
interface StaticBox { id: EntityId; b: Box3; p: Vec3 }

/**
 * 3D AABB kinematics for every {@link DynamicBodyTag} body: gravity → X sweep →
 * Z sweep → Y sweep, with penetration-based axis-separated push-out against
 * {@link StaticBodyTag} colliders. Axis order keeps a wall contact from
 * cancelling a same-tick jump. A grounded body auto-climbs steps up to
 * {@link STEP_HEIGHT} (stairs) instead of being blocked.
 *
 * Brute-force over the statics — one arena has a handful; a 3D broadphase is
 * engine roadmap work, not example work.
 */
export const kinematics3dSystem: SchedulableSystem<GameState> = {
  name: 'kinematics3d',
  runAfter: ['input', 'ai', 'elevator'],
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    const posStore = ctx.world.getStore(Position3DDef);
    const velStore = ctx.world.getStore(Velocity3DDef);
    const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
    const groundedStore = ctx.world.getStore(GroundedDef);

    const statics: StaticBox[] = [];
    for (const sid of ctx.world.getTag(StaticBodyTag)) {
      const p = posStore.get(sid);
      const b = aabbStore.get(sid);
      if (p && b)
        statics.push({ id: sid, b, p });
    }

    for (const id of ctx.world.getTag(DynamicBodyTag)) {
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      const aabb = aabbStore.get(id);
      if (!pos || !vel || !aabb)
        continue;
      const grounded = groundedStore.get(id) ?? undefined;
      // Whether the body was resting last tick — step-up only applies on the
      // ground (you can't climb stairs mid-jump). Capture before we clear it.
      const wasGrounded = grounded?.onGround ?? false;

      // Gravity + terminal velocity (gravity subtracts because +Y is up).
      vel.vy -= GRAVITY * dt;
      if (vel.vy < -MAX_FALL_SPEED)
        vel.vy = -MAX_FALL_SPEED;

      if (grounded)
        grounded.onGround = false;

      pos.x += vel.vx * dt;
      resolveAxis(pos, aabb, statics, 'x', vel, grounded, wasGrounded);

      pos.z += vel.vz * dt;
      resolveAxis(pos, aabb, statics, 'z', vel, grounded, wasGrounded);

      pos.y += vel.vy * dt;
      resolveAxis(pos, aabb, statics, 'y', vel, grounded, wasGrounded);
    }
  },
};

function resolveAxis(
  pos: Vec3,
  aabb: Box3,
  statics: StaticBox[],
  axis: 'x' | 'y' | 'z',
  vel: Vel3,
  grounded?: { onGround: boolean },
  wasGrounded = false,
): void {
  const halfW = aabb.w / 2;
  const halfH = aabb.h / 2;
  const halfD = aabb.d / 2;

  for (const { b, p } of statics) {
    const overlapX = halfW + b.w / 2 - Math.abs(pos.x - p.x);
    const overlapY = halfH + b.h / 2 - Math.abs(pos.y - p.y);
    const overlapZ = halfD + b.d / 2 - Math.abs(pos.z - p.z);
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0)
      continue;

    // Only separate along the current axis when it is the *shallowest*
    // penetration — the correct push-out direction. Without this, a body
    // overlapping a large thin wall gets flung out the wall's wide face and
    // tunnels through other geometry. This also stops the resting floor from
    // spuriously blocking horizontal movement.
    const minOverlap = Math.min(overlapX, overlapY, overlapZ);

    if (axis === 'x') {
      if (overlapX > minOverlap)
        continue;
      if (tryStepUp(pos, halfH, p, b, vel, grounded, wasGrounded))
        continue; // climbed the step instead of being blocked
      pos.x += pos.x < p.x ? -overlapX : overlapX;
      vel.vx = 0;
    }
    else if (axis === 'z') {
      if (overlapZ > minOverlap)
        continue;
      if (tryStepUp(pos, halfH, p, b, vel, grounded, wasGrounded))
        continue;
      pos.z += pos.z < p.z ? -overlapZ : overlapZ;
      vel.vz = 0;
    }
    else {
      if (overlapY > minOverlap)
        continue;
      if (pos.y < p.y) {
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

/**
 * If a grounded body runs into a static whose top is within {@link STEP_HEIGHT}
 * above its feet, lift it onto that step (feet level with the step top) instead
 * of blocking — the classic character-controller "step offset" that lets you
 * walk up stairs without jumping. Returns whether it climbed.
 */
function tryStepUp(
  pos: Vec3,
  halfH: number,
  p: Vec3,
  b: Box3,
  vel: Vel3,
  grounded: { onGround: boolean } | undefined,
  wasGrounded: boolean,
): boolean {
  if (!grounded || !wasGrounded)
    return false;
  const stepTop = p.y + b.h / 2;
  const feet = pos.y - halfH;
  const rise = stepTop - feet;
  if (rise <= 0.02 || rise > STEP_HEIGHT)
    return false;
  pos.y = stepTop + halfH; // place feet on the step top
  grounded.onGround = true;
  if (vel.vy < 0)
    vel.vy = 0;
  return true;
}
