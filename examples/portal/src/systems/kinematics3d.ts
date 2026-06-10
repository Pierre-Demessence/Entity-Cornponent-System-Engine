import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import {
  DynamicBodyTag,
  GroundedDef,
  HeldTag,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from '../components';
import { GRAVITY, MAX_FALL_SPEED, PORTAL_CARVE_DEPTH } from '../game';
import { localCoords, withinOpening } from './portal-math';

interface Vec3 { x: number; y: number; z: number }
interface Box3 { d: number; h: number; w: number }
interface Vel3 { vx: number; vy: number; vz: number }
interface StaticBox { id: EntityId; b: Box3; p: Vec3 }

/**
 * 3D AABB kinematics for every {@link DynamicBodyTag} body (player + cube):
 * gravity → X sweep → Z sweep → Y sweep, penetration-based axis-separated
 * push-out against {@link StaticBodyTag} colliders. Axis order keeps a wall
 * contact from cancelling a same-tick jump.
 *
 * Brute-force over the statics — the single room has a handful, and a 3D
 * broadphase is roadmap work, not example work.
 */
export const kinematics3dSystem: SchedulableSystem<GameState> = {
  name: 'kinematics3d',
  runAfter: ['input'],
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

    // The cube is a one-way collider for the player (you can't walk through it),
    // but only when it's resting in the world — a held cube is excluded.
    const heldTag = ctx.world.getTag(HeldTag);
    let playerColliders = statics;
    if (ctx.cubeId != null && !heldTag.has(ctx.cubeId)) {
      const cp = posStore.get(ctx.cubeId);
      const cb = aabbStore.get(ctx.cubeId);
      if (cp && cb)
        playerColliders = statics.concat({ id: ctx.cubeId, b: cb, p: cp });
    }

    for (const id of ctx.world.getTag(DynamicBodyTag)) {
      if (heldTag.has(id))
        continue; // held bodies are kinematic; the carry system positions them
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      const aabb = aabbStore.get(id);
      if (!pos || !vel || !aabb)
        continue;
      const grounded = groundedStore.get(id) ?? undefined;
      const carved = carvedSurfaces(ctx, pos);
      const colliders = id === ctx.playerId ? playerColliders : statics;

      // Gravity + terminal velocity (gravity subtracts because +Y is up).
      vel.vy -= GRAVITY * dt;
      if (vel.vy < -MAX_FALL_SPEED)
        vel.vy = -MAX_FALL_SPEED;

      pos.x += vel.vx * dt;
      resolveAxis(pos, aabb, colliders, 'x', vel, carved);

      pos.z += vel.vz * dt;
      resolveAxis(pos, aabb, colliders, 'z', vel, carved);

      if (grounded)
        grounded.onGround = false;
      pos.y += vel.vy * dt;
      resolveAxis(pos, aabb, colliders, 'y', vel, carved, grounded);
    }
  },
};

function resolveAxis(
  pos: Vec3,
  aabb: Box3,
  statics: StaticBox[],
  axis: 'x' | 'y' | 'z',
  vel: Vel3,
  carved: Set<EntityId>,
  grounded?: { onGround: boolean },
): void {
  const halfW = aabb.w / 2;
  const halfH = aabb.h / 2;
  const halfD = aabb.d / 2;

  for (const { id, b, p } of statics) {
    if (carved.has(id))
      continue;
    const overlapX = halfW + b.w / 2 - Math.abs(pos.x - p.x);
    const overlapY = halfH + b.h / 2 - Math.abs(pos.y - p.y);
    const overlapZ = halfD + b.d / 2 - Math.abs(pos.z - p.z);
    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0)
      continue;

    // Only separate along the current axis when it is the *shallowest*
    // penetration — the correct push-out direction. Without this, a body
    // overlapping a large thin wall (e.g. a 22-wide room wall) gets flung out
    // the wall's wide face and tunnels through other geometry. This also stops
    // the resting floor from spuriously blocking horizontal movement.
    const minOverlap = Math.min(overlapX, overlapY, overlapZ);

    if (axis === 'x') {
      if (overlapX > minOverlap)
        continue;
      pos.x += pos.x < p.x ? -overlapX : overlapX;
      vel.vx = 0;
    }
    else if (axis === 'z') {
      if (overlapZ > minOverlap)
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
 * Host surfaces to ignore for a body this tick: the wall a portal sits on is
 * carved away while the body is inside that portal's opening, so it can walk
 * through. Only carves when a linked pair exists (otherwise a portal is just a
 * decal on a solid wall).
 */
function carvedSurfaces(ctx: GameState, pos: Vec3): Set<EntityId> {
  const carved = new Set<EntityId>();
  const { blue, orange } = ctx.portals;
  if (!blue || !orange)
    return carved;
  for (const portal of [blue, orange]) {
    const l = localCoords(pos, portal);
    if (Math.abs(l.z) < PORTAL_CARVE_DEPTH && withinOpening(l))
      carved.add(portal.surfaceId);
  }
  return carved;
}
