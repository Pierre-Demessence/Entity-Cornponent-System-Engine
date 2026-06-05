import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { scaleToSpeed } from '@pierre/ecs/modules/motion';

import { EnemyTag, PositionDef, VelocityDef } from '../components';
import { ENEMY_SPEED } from '../game';

/**
 * Enemy steering: each enemy sets its velocity to point at the player
 * at a constant speed. Runs before motion integration so the updated
 * velocity is consumed in the same tick.
 *
 * Deliberately trivial — no separation, no pathfinding. The point of
 * this rung is to test engine throughput at scale, not AI quality.
 */
export const enemySteerSystem: SchedulableSystem<GameState> = {
  name: 'enemy-steer',
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const posStore = ctx.world.getStore(PositionDef);
    const velStore = ctx.world.getStore(VelocityDef);
    const player = posStore.get(ctx.playerId);
    if (!player)
      return;
    for (const id of ctx.world.getTag(EnemyTag)) {
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      if (!pos || !vel)
        continue;
      const dx = player.x - pos.x;
      const dy = player.y - pos.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-3) {
        vel.vx = 0;
        vel.vy = 0;
        continue;
      }
      const v = scaleToSpeed(dx, dy, ENEMY_SPEED);
      vel.vx = v.x;
      vel.vy = v.y;
    }
  },
};
