import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { Position3DDef, Velocity3DDef } from '../components';
import { BULLET_SPEED, FIRE_COOLDOWN_MS, MUZZLE_OFFSET, spawnBullet } from '../game';
import { quatForward } from '../quat';

/**
 * Fires a bullet while the trigger is held (LMB or Space) and the per-shot
 * cooldown has elapsed. The bullet leaves the nose along the ship's forward
 * axis and inherits the ship's momentum, so shots track the fixed centre
 * crosshair (where the nose points), independent of the steering reticle.
 */
export const weaponSystem: SchedulableSystem<GameState> = {
  name: 'weapon',
  runAfter: ['ship'],
  run(ctx) {
    if (ctx.fireTimer > 0)
      ctx.fireTimer -= ctx.dtMs;
    const wantsFire = ctx.firing || ctx.input.isDown('fire');
    if (ctx.playerId == null || !wantsFire || ctx.fireTimer > 0)
      return;

    const pos = ctx.world.getStore(Position3DDef).get(ctx.playerId);
    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId);
    if (!pos || !vel)
      return;

    const dir = quatForward(ctx.orientation);
    spawnBullet(
      ctx,
      {
        x: pos.x + dir.x * MUZZLE_OFFSET,
        y: pos.y + dir.y * MUZZLE_OFFSET,
        z: pos.z + dir.z * MUZZLE_OFFSET,
      },
      {
        x: vel.vx + dir.x * BULLET_SPEED,
        y: vel.vy + dir.y * BULLET_SPEED,
        z: vel.vz + dir.z * BULLET_SPEED,
      },
    );
    ctx.fireTimer = FIRE_COOLDOWN_MS;
  },
};
