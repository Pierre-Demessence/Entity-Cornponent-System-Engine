import type { SchedulableSystem } from '@pierre/ecs';

import type { Velocity3D } from '../components';
import type { GameState, Portal, Vec3 } from '../game';

import { DynamicBodyTag, HeldTag, PlayerTag, Position3DDef, Velocity3DDef } from '../components';
import { MAX_PITCH } from '../game';
import { forwardVec, localCoords, transformPoint, transformVec, withinOpening } from './portal-math';

/**
 * Teleport bodies through the linked portal pair, conserving momentum. A body
 * that crosses a portal's plane (front → back) within its opening is relocated
 * to the other portal with its position, velocity — and, for the player, look
 * direction — rotated by the portal-pair transform. "Speedy thing goes in,
 * speedy thing comes out."
 *
 * Runs after movement so it sees the post-integration position (the
 * collision-carving in `kinematics3d` is what let the body reach the plane).
 */
export const teleportSystem: SchedulableSystem<GameState> = {
  name: 'teleport',
  runAfter: ['kinematics3d'],
  run(ctx) {
    const { blue, orange } = ctx.portals;
    if (!blue || !orange)
      return; // a teleport needs a linked pair

    const dt = ctx.dtMs / 1000;
    const posStore = ctx.world.getStore(Position3DDef);
    const velStore = ctx.world.getStore(Velocity3DDef);
    const playerTag = ctx.world.getTag(PlayerTag);
    const heldTag = ctx.world.getTag(HeldTag);

    for (const id of ctx.world.getTag(DynamicBodyTag)) {
      if (heldTag.has(id))
        continue; // a held body follows the camera; it doesn't teleport on its own
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      if (!pos || !vel)
        continue;
      const isPlayer = playerTag.has(id);
      if (tryTeleport(ctx, pos, vel, dt, blue, orange, isPlayer))
        continue;
      tryTeleport(ctx, pos, vel, dt, orange, blue, isPlayer);
    }
  },
};

function tryTeleport(
  ctx: GameState,
  pos: Vec3,
  vel: Velocity3D,
  dt: number,
  src: Portal,
  dst: Portal,
  isPlayer: boolean,
): boolean {
  const prev: Vec3 = { x: pos.x - vel.vx * dt, y: pos.y - vel.vy * dt, z: pos.z - vel.vz * dt };
  const curL = localCoords(pos, src);
  const prevL = localCoords(prev, src);

  // Crossed from the front (local z > 0) to the back, inside the opening.
  if (prevL.z <= 0 || curL.z > 0 || !withinOpening(curL))
    return false;

  const np = transformPoint(pos, src, dst);
  const nv = transformVec({ x: vel.vx, y: vel.vy, z: vel.vz }, src, dst);
  pos.x = np.x;
  pos.y = np.y;
  pos.z = np.z;
  vel.vx = nv.x;
  vel.vy = nv.y;
  vel.vz = nv.z;

  if (isPlayer) {
    const nf = transformVec(forwardVec(ctx.yaw, ctx.pitch), src, dst);
    ctx.yaw = Math.atan2(-nf.x, -nf.z);
    ctx.pitch = clamp(Math.asin(clamp(nf.y, -1, 1)), -MAX_PITCH, MAX_PITCH);
  }
  return true;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
