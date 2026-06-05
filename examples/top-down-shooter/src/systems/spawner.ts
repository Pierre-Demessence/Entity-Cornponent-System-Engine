import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { tickSpawner } from '@pierre/ecs/modules/spawner';

import { spawnEnemyAtEdge } from '../game';

/**
 * Spawn timer: emits an enemy every `currentSpawnInterval(elapsed)` ms (the
 * spawner's ramped interval provider). Also advances `elapsedMs` since the
 * spawner is the authoritative game-time counter.
 */
export const spawnerSystem: SchedulableSystem<GameState> = {
  name: 'spawner',
  run(ctx) {
    if (ctx.dead)
      return;
    ctx.elapsedMs += ctx.dtMs;
    tickSpawner(ctx.enemySpawner, ctx.dtMs, () => spawnEnemyAtEdge(ctx));
  },
};
