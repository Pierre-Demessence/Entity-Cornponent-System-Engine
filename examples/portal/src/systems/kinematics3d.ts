import type { EntityId, SchedulableSystem } from '@pierre/ecs';
import type { Aabb3 } from '@pierre/ecs/modules/collision-3d';
import type { Vec3 } from '@pierre/ecs/modules/math';

import type { GameState } from '../game';

import { makeKinematics3DSystem } from '@pierre/ecs/modules/kinematics-3d';

import {
  DynamicBodyTag,
  HeldTag,
  Position3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from '../components';
import { GRAVITY, MAX_FALL_SPEED, PORTAL_CARVE_DEPTH } from '../game';
import { localCoords, withinOpening } from './portal-math';

/**
 * 3D AABB kinematics for every {@link DynamicBodyTag} body (player + cube) — the
 * engine's `modules/kinematics-3d`. The two portal-specific collision policies
 * ride in the injected broadphase:
 *
 * - the wall a portal is mounted on is carved away while the body is inside the
 *   opening, so it can walk through;
 * - the cube is a one-way collider for the player (you can't walk through it)
 *   while it rests in the world, and is dropped from the candidate list entirely
 *   while held.
 *
 * Brute-force over the statics — the single room has a handful, and a 3D
 * broadphase is roadmap work, not example work.
 */
export const kinematics3dSystem: SchedulableSystem<GameState> = makeKinematics3DSystem<GameState>({
  name: 'kinematics3d',
  broadphase: collidersFor,
  dynamicTag: DynamicBodyTag,
  gravity: GRAVITY,
  positionDef: Position3DDef,
  runAfter: ['input'],
  terminalVelocity: MAX_FALL_SPEED,
  velocityDef: Velocity3DDef,
});

/**
 * Candidate colliders for the body whose axis-projected box is `box`: every
 * static the body is not currently carving through, plus the resting cube.
 *
 * The list *is* the collider set — the module is given no `staticTag` filter,
 * because the resting cube is a dynamic body that must still block and carries
 * no `StaticBodyTag`. Yielding the cube for the cube itself is harmless: the
 * module skips the body it is currently resolving.
 */
function collidersFor(ctx: GameState, box: Aabb3): Iterable<EntityId> {
  const carved = carvedSurfaces(ctx, box.center);
  const out: EntityId[] = [];
  for (const sid of ctx.world.getTag(StaticBodyTag)) {
    if (!carved.has(sid))
      out.push(sid);
  }
  if (ctx.cubeId != null && !ctx.world.getTag(HeldTag).has(ctx.cubeId))
    out.push(ctx.cubeId);
  return out;
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
