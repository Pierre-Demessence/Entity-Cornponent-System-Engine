import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { OpacityDef } from '@pierre/ecs/modules/render-canvas2d';

import { PositionDef, RotationDef, ThrustFlameTag } from '../components';

/**
 * The thrust flame is a persistent entity created alongside the ship.
 * Each tick this system:
 *   - syncs flame position + rotation to the ship (keeps it glued to the tail),
 *   - toggles flame OpacityDef to 1 when thrust is held, 0 otherwise.
 *
 * Uses the new OpacityDef from modules/render-canvas2d V2; no entity
 * create/destroy churn, no EntityId pointer on GameState.
 */
export const thrustFlameSystem: SchedulableSystem<GameState> = {
  name: 'thrust-flame',
  run(ctx) {
    if (ctx.shipId === null)
      return;

    const flameTag = ctx.world.getTag(ThrustFlameTag);
    if (flameTag.size === 0)
      return;

    const shipPos = ctx.world.getStore(PositionDef).get(ctx.shipId);
    const shipRot = ctx.world.getStore(RotationDef).get(ctx.shipId);
    if (!shipPos || !shipRot)
      return;

    const visible = !ctx.dead && ctx.input.isDown('thrust');

    for (const flameId of flameTag) {
      const flamePos = ctx.world.getStore(PositionDef).get(flameId);
      const flameRot = ctx.world.getStore(RotationDef).get(flameId);
      const flameOpacity = ctx.world.getStore(OpacityDef).get(flameId);
      if (!flamePos || !flameRot || !flameOpacity)
        continue;

      flamePos.x = shipPos.x;
      flamePos.y = shipPos.y;
      flameRot.angle = shipRot.angle;
      flameOpacity.value = visible ? 1 : 0;
    }
  },
};
