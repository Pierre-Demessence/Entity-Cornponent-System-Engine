import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import {
  ElevatorDef,
  ElevatorTag,
  GroundedDef,
  Position3DDef,
  ShapeAabb3DDef,
} from '../components';

/**
 * Moving platforms. Each {@link ElevatorTag} oscillates on Y between its
 * `minY`/`maxY`, and **carries** the player when they're standing on it (so a
 * descending platform doesn't drop out from under you). Runs before
 * `kinematics3d` so the player's collision resolves against the moved platform.
 *
 * Vertical-only, so there's no horizontal-friction model — the rider just
 * inherits the platform's Y delta. (This is the engine's "moving-platform
 * rider" / `modules/attach` shape, hand-rolled here.)
 */
export const elevatorSystem: SchedulableSystem<GameState> = {
  name: 'elevator',
  runAfter: ['input'],
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    const posStore = ctx.world.getStore(Position3DDef);
    const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
    const elevStore = ctx.world.getStore(ElevatorDef);
    const groundedStore = ctx.world.getStore(GroundedDef);

    const playerId = ctx.playerId;
    const playerPos = playerId == null ? undefined : posStore.get(playerId);
    const playerAabb = playerId == null ? undefined : aabbStore.get(playerId);
    const playerGrounded = playerId == null ? undefined : groundedStore.get(playerId);

    for (const id of ctx.world.getTag(ElevatorTag)) {
      const pos = posStore.get(id);
      const box = aabbStore.get(id);
      const e = elevStore.get(id);
      if (!pos || !box || !e)
        continue;

      const prevY = pos.y;
      let y = pos.y + e.speed * e.dir * dt;
      if (y >= e.maxY) {
        y = e.maxY;
        e.dir = -1;
      }
      else if (y <= e.minY) {
        y = e.minY;
        e.dir = 1;
      }
      const dy = y - prevY;
      pos.y = y;

      // Carry the player when it's resting on this platform's top face.
      if (dy !== 0 && playerPos && playerAabb && playerGrounded?.onGround) {
        const top = prevY + box.h / 2;
        const feet = playerPos.y - playerAabb.h / 2;
        const withinX = Math.abs(playerPos.x - pos.x) <= box.w / 2 + playerAabb.w / 2;
        const withinZ = Math.abs(playerPos.z - pos.z) <= box.d / 2 + playerAabb.d / 2;
        if (withinX && withinZ && Math.abs(feet - top) < 0.2)
          playerPos.y += dy;
      }
    }
  },
};
