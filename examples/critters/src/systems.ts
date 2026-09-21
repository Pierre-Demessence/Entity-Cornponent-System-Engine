import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from './game';

import { ENERGY_DRAIN, HUNGER_RATE } from './game';
import { CRITTER_BT } from './tree';

/**
 * Ticks every critter's brain. Passive meters drift first (hunger rises,
 * energy drains), then the shared reactive behaviour tree runs against
 * each critter's blackboard via `ctx.activeCritter`. The tree writes the
 * critter's velocity through `modules/steering`; motion integrates it.
 */
export const critterSystem: SchedulableSystem<GameState> = {
  name: 'critter',
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    for (const c of ctx.critters) {
      c.hunger = Math.min(1, c.hunger + HUNGER_RATE * dt);
      c.energy = Math.max(0, c.energy - ENERGY_DRAIN * dt);
      ctx.activeCritter = c;
      CRITTER_BT(ctx);
      ctx.activeCritter = null;
    }
  },
};
