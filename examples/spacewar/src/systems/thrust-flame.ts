import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState, PlayerSlot } from '../game';

import { AttachDef } from '@pierre/ecs/modules/attach';
import { OpacityDef } from '@pierre/ecs/modules/render-canvas2d';

import { Ship1Tag, Ship2Tag, ThrustFlameTag } from '../components';

/**
 * Toggles each thrust flame's opacity based on whether the owning player
 * is holding thrust. Position + rotation sync is handled by `modules/attach`.
 */
export const thrustFlameSystem: SchedulableSystem<GameState> = {
  name: 'thrust-flame',
  run(ctx) {
    const flameTag = ctx.world.getTag(ThrustFlameTag);
    if (flameTag.size === 0)
      return;

    const ship1Tag = ctx.world.getTag(Ship1Tag);
    const ship2Tag = ctx.world.getTag(Ship2Tag);

    for (const flameId of flameTag) {
      const flameOpacity = ctx.world.getStore(OpacityDef).get(flameId);
      if (!flameOpacity)
        continue;

      const attach = ctx.world.getStore(AttachDef).get(flameId);
      if (!attach) {
        flameOpacity.value = 0;
        continue;
      }

      const parentId = attach.parent;
      let slot: PlayerSlot | null = null;
      if (ship1Tag.has(parentId))
        slot = 1;
      else if (ship2Tag.has(parentId))
        slot = 2;

      const visible = slot != null && !ctx.dead && ctx.inputs[slot]!.isDown('thrust');
      flameOpacity.value = visible ? 1 : 0;
    }
  },
};
