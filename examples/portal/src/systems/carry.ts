import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { HeldTag, Position3DDef, Velocity3DDef } from '../components';
import { GRAB_RANGE, HOLD_DIST, PLAYER_EYE } from '../game';
import { forwardVec } from './portal-math';

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
      cubePos.x = eyeX + f.x * HOLD_DIST;
      cubePos.y = eyeY + f.y * HOLD_DIST;
      cubePos.z = eyeZ + f.z * HOLD_DIST;
      cubeVel.vx = 0;
      cubeVel.vy = 0;
      cubeVel.vz = 0;
    }
  },
};
