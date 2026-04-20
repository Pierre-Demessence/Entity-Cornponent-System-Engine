import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { LifetimeDef } from '../components';
import { despawn } from '../game';

export const lifetimeSystem: SchedulableSystem<GameState> = {
  name: 'lifetime',
  runAfter: ['movement'],
  run(ctx) {
    const store = ctx.world.getStore(LifetimeDef);
    const expired: number[] = [];
    for (const id of store.keys()) {
      const life = store.get(id)!;
      life.remainingMs -= ctx.dtMs;
      if (life.remainingMs <= 0)
        expired.push(id);
    }
    for (const id of expired) despawn(ctx, id);
  },
};
