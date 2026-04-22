import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { currentSpawnInterval, spawnEnemyAtEdge } from '../game';

/**
 * Spawn timer: accumulates dt, emits an enemy every
 * `currentSpawnInterval(elapsed)` ms. Also advances `elapsedMs` since
 * the spawner is the authoritative game-time counter.
 */
export const spawnerSystem: SchedulableSystem<GameState> = {
  name: 'spawner',
  run(ctx) {
    if (ctx.dead)
      return;
    ctx.elapsedMs += ctx.dtMs;
    ctx.spawnTimerMs += ctx.dtMs;
    const interval = currentSpawnInterval(ctx.elapsedMs);
    while (ctx.spawnTimerMs >= interval) {
      ctx.spawnTimerMs -= interval;
      spawnEnemyAtEdge(ctx);
    }
  },
};
