import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { HeldTag, Position3DDef, ShapeAabb3DDef, StaticBodyTag, Velocity3DDef } from '../components';
import { CUBE_SIZE, GRAB_RANGE, HOLD_DIST, PLAYER_EYE } from '../game';
import { forwardVec, localCoords, rayAabb, withinOpening } from './portal-math';

/**
 * Cube carry. `E` grabs the cube when it's close and roughly in front; pressing
 * `E` again drops it. While held, the cube is tagged {@link HeldTag} (so the
 * physics + teleport systems leave it alone) and is pinned a fixed distance in
 * front of the eye each tick — including straight after a teleport, so it comes
 * through portals with you.
 */
export const carrySystem: SchedulableSystem<GameState> = {
  name: 'carry',
  runAfter: ['teleport'],
  run(ctx) {
    if (ctx.won || ctx.playerId == null || ctx.cubeId == null)
      return;

    const posStore = ctx.world.getStore(Position3DDef);
    const velStore = ctx.world.getStore(Velocity3DDef);
    const heldTag = ctx.world.getTag(HeldTag);
    const playerPos = posStore.get(ctx.playerId);
    const cubePos = posStore.get(ctx.cubeId);
    const cubeVel = velStore.get(ctx.cubeId);
    if (!playerPos || !cubePos || !cubeVel)
      return;

    const eyeX = playerPos.x;
    const eyeY = playerPos.y + PLAYER_EYE;
    const eyeZ = playerPos.z;
    const f = forwardVec(ctx.yaw, ctx.pitch);
    let held = heldTag.has(ctx.cubeId);

    if (ctx.input.justPressed('grab')) {
      if (held) {
        heldTag.delete(ctx.cubeId);
        held = false;
      }
      else {
        const dx = cubePos.x - eyeX;
        const dy = cubePos.y - eyeY;
        const dz = cubePos.z - eyeZ;
        const dist = Math.hypot(dx, dy, dz);
        const facing = dist > 1e-3 ? (dx * f.x + dy * f.y + dz * f.z) / dist : 1;
        if (dist <= GRAB_RANGE && facing > 0.2) {
          heldTag.add(ctx.cubeId);
          held = true;
        }
      }
    }

    if (held) {
      // Clamp the carry distance with a forward ray so the cube doesn't poke
      // through a wall we're facing — but allow it through a portal opening, so
      // carrying a cube into a portal isn't blocked by the portal's host wall.
      const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
      const origin = { x: eyeX, y: eyeY, z: eyeZ };
      const clearance = CUBE_SIZE / 2 + 0.1;
      const { blue, orange } = ctx.portals;
      let dist = HOLD_DIST;
      for (const sid of ctx.world.getTag(StaticBodyTag)) {
        const c = posStore.get(sid);
        const a = aabbStore.get(sid);
        if (!c || !a)
          continue;
        const hit = rayAabb(origin, f, c, { x: a.w / 2, y: a.h / 2, z: a.d / 2 });
        if (!hit)
          continue;
        const hx = origin.x + f.x * hit.t;
        const hy = origin.y + f.y * hit.t;
        const hz = origin.z + f.z * hit.t;
        if (throughPortalOpening(blue, sid, hx, hy, hz) || throughPortalOpening(orange, sid, hx, hy, hz))
          continue;
        if (hit.t - clearance < dist)
          dist = hit.t - clearance;
      }
      if (dist < 0.6)
        dist = 0.6;
      cubePos.x = eyeX + f.x * dist;
      cubePos.y = eyeY + f.y * dist;
      cubePos.z = eyeZ + f.z * dist;
      cubeVel.vx = 0;
      cubeVel.vy = 0;
      cubeVel.vz = 0;
    }
  },
};

/** True if the ray hit point lies within `portal`'s opening on its host wall. */
function throughPortalOpening(
  portal: GameState['portals']['blue'],
  surfaceId: number,
  hx: number,
  hy: number,
  hz: number,
): boolean {
  if (!portal || portal.surfaceId !== surfaceId)
    return false;
  return withinOpening(localCoords({ x: hx, y: hy, z: hz }, portal));
}
