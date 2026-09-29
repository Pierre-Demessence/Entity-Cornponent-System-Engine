import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { quatForward } from '@pierre/ecs/modules/math';

import { CooldownDef, Position3DDef, ready, Rotation3DDef, trigger, Velocity3DDef } from '../components';
import { BULLET_SPEED, MUZZLE_OFFSET, spawnBullet } from '../game';

/**
 * Fires a bullet while the trigger is held (LMB or Space) and the per-shot
 * cooldown has elapsed. The bullet leaves the nose along the ship's forward
 * axis and inherits the ship's momentum, so shots track the fixed centre
 * crosshair (where the nose points), independent of the steering reticle.
 */
export const weaponSystem: SchedulableSystem<GameState> = {
  name: 'weapon',
  runAfter: ['ship', 'cooldown'],
  run(ctx) {
    if (ctx.playerId == null || !ctx.input.isDown('fire'))
      return;
    const cooldown = ctx.world.getStore(CooldownDef).get(ctx.playerId);
    if (!cooldown || !ready(cooldown))
      return;

    const pos = ctx.world.getStore(Position3DDef).get(ctx.playerId);
    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId);
    const orientation = ctx.world.getStore(Rotation3DDef).get(ctx.playerId);
    if (!pos || !vel || !orientation)
      return;

    const dir = quatForward(orientation);
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
    trigger(cooldown);
  },
};
