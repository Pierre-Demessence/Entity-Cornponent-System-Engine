import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { PositionDef, VelocityDef } from '../components';
import { cellOf, SCREEN_H, SCREEN_W, wrap } from '../game';

export const movementSystem: SchedulableSystem<GameState> = {
  name: 'movement',
  runAfter: ['input'],
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    const posStore = ctx.world.getStore(PositionDef);
    const velStore = ctx.world.getStore(VelocityDef);

    for (const id of velStore.keys()) {
      const vel = velStore.get(id)!;
      const pos = posStore.get(id)!;
      const prev = cellOf(pos.x, pos.y);
      pos.x = wrap(pos.x + vel.vx * dt, SCREEN_W);
      pos.y = wrap(pos.y + vel.vy * dt, SCREEN_H);
      const next = cellOf(pos.x, pos.y);
      if (prev.x !== next.x || prev.y !== next.y) {
        ctx.grid.move(id, prev, next);
      }
    }
  },
};
