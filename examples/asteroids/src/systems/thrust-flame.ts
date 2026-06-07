import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { OpacityDef } from '@pierre/ecs/modules/render-canvas2d';

import { ThrustFlameTag } from '../components';

/**
 * Toggles the thrust flame's opacity based on whether thrust is held.
 * Position + rotation sync is handled by `modules/attach`.
 */
export const thrustFlameSystem: SchedulableSystem<GameState> = {
  name: 'thrust-flame',
  run(ctx) {
    const flameTag = ctx.world.getTag(ThrustFlameTag);
    if (flameTag.size === 0)
      return;

    const visible = !ctx.dead && ctx.input.isDown('thrust');

    for (const flameId of flameTag) {
      const flameOpacity = ctx.world.getStore(OpacityDef).get(flameId);
      if (!flameOpacity)
        continue;
      flameOpacity.value = visible ? 1 : 0;
    }
  },
};
