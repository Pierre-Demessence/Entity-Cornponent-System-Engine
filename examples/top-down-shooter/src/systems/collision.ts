import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { circleVsCircle, makeTriggerSystem } from '@pierre/ecs/modules/collision';

import {
  BulletTag,
  EnemyTag,
  PositionDef,
  ShapeCircleDef,
} from '../components';
import {
  cellOf,
  despawn,
  SCORE_PER_KILL,
} from '../game';

/**
 * Bullet↔enemy and enemy↔player collisions.
 *
 * Broadphase walks each enemy's neighbourhood via the spatial grid,
 * yielding pairs for narrowphase circle-vs-circle. Buffered
 * destruction avoids mutating the world while tag iteration is live.
 */
export function makeCollisionSystem(): SchedulableSystem<GameState> {
  const destroyed = new Set<EntityId>();
  const kills: EntityId[] = [];
  let playerHit = false;

  const trigger = makeTriggerSystem<GameState>({
    name: 'collision-pairs',
    broadphase(ctx) {
      destroyed.clear();
      kills.length = 0;
      playerHit = false;
      const posStore = ctx.world.getStore(PositionDef);
      const pairs: Array<readonly [EntityId, EntityId]> = [];
      for (const enemyId of ctx.world.getTag(EnemyTag)) {
        const pos = posStore.get(enemyId);
        if (!pos)
          continue;
        const cell = cellOf(pos.x, pos.y);
        for (const otherId of ctx.grid.queryNear(cell, 1)) {
          if (otherId === enemyId)
            continue;
          pairs.push([enemyId, otherId] as const);
        }
      }
      return pairs;
    },
    onOverlap(ctx, enemyId, otherId) {
      if (destroyed.has(enemyId) || destroyed.has(otherId))
        return;
      if (ctx.world.getTag(BulletTag).has(otherId)) {
        kills.push(enemyId);
        destroyed.add(enemyId);
        destroyed.add(otherId);
        return;
      }
      if (ctx.playerId === otherId && !playerHit) {
        playerHit = true;
      }
    },
    overlaps(ctx, enemyId, otherId) {
      const posStore = ctx.world.getStore(PositionDef);
      const radStore = ctx.world.getStore(ShapeCircleDef);
      const ep = posStore.get(enemyId);
      const er = radStore.get(enemyId);
      const op = posStore.get(otherId);
      const or_ = radStore.get(otherId);
      if (!ep || !er || !op || !or_)
        return false;
      return circleVsCircle(ep, er.radius, op, or_.radius);
    },
  });

  return {
    name: 'collision',
    runAfter: ['movement'],
    run(ctx) {
      trigger.run(ctx);
      for (const id of destroyed)
        despawn(ctx, id);
      if (kills.length > 0) {
        ctx.score += kills.length * SCORE_PER_KILL;
        for (const id of kills)
          ctx.events.emit({ enemyId: id, type: 'EnemyKilled' });
      }
      if (playerHit && !ctx.dead) {
        ctx.dead = true;
        ctx.events.emit({ type: 'PlayerHit' });
        ctx.events.emit({ type: 'GameOver' });
      }
    },
  };
}
