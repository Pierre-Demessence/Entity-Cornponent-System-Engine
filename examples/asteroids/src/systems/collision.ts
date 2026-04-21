import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { circleVsCircle, makeTriggerSystem } from '@pierre/ecs/modules/collision';

import {
  BulletTag,
  PositionDef,
  RockTag,
  RockTierDef,
  ShapeCircleDef,
} from '../components';
import {
  cellOf,
  despawn,

  ROCK_TIERS,
  spawnRock,
} from '../game';

/**
 * Rock↔bullet and rock↔ship collisions. The broadphase walks each
 * rock's neighbourhood via the spatial grid; narrowphase is
 * circle-vs-circle. `onOverlap` buffers hits and the outer `run`
 * drains the buffer after pair iteration so no world mutations
 * happen while we're still iterating tags.
 *
 * State lives in a closure so each call to `makeCollisionSystem()`
 * yields an independent instance — safe for parallel tests,
 * hot-reload, or future multi-world setups.
 */
function makeCollisionSystem(): SchedulableSystem<GameState> {
  const destroyed = new Set<EntityId>();
  const splits: { bulletId: EntityId; rockId: EntityId }[] = [];
  let shipHit = false;

  const trigger = makeTriggerSystem<GameState>({
    name: 'collision-pairs',
    broadphase(ctx) {
      destroyed.clear();
      splits.length = 0;
      shipHit = false;

      const posStore = ctx.world.getStore(PositionDef);
      const pairs: Array<readonly [EntityId, EntityId]> = [];
      for (const rockId of ctx.world.getTag(RockTag)) {
        const rPos = posStore.get(rockId);
        if (!rPos)
          continue;
        const rCell = cellOf(rPos.x, rPos.y);
        for (const otherId of ctx.grid.queryNear(rCell, 2)) {
          if (otherId === rockId)
            continue;
          pairs.push([rockId, otherId] as const);
        }
      }
      return pairs;
    },
    onOverlap(ctx, rockId, otherId) {
      if (destroyed.has(rockId) || destroyed.has(otherId))
        return;
      if (ctx.world.getTag(BulletTag).has(otherId)) {
        splits.push({ bulletId: otherId, rockId });
        destroyed.add(rockId);
        destroyed.add(otherId);
        return;
      }
      if (ctx.shipId === otherId) {
        shipHit = true;
        destroyed.add(otherId);
      }
    },
    overlaps(ctx, rockId, otherId) {
      const posStore = ctx.world.getStore(PositionDef);
      const radStore = ctx.world.getStore(ShapeCircleDef);
      const rPos = posStore.get(rockId);
      const rRad = radStore.get(rockId);
      const oPos = posStore.get(otherId);
      const oRad = radStore.get(otherId);
      if (!rPos || !rRad || !oPos || !oRad)
        return false;
      return circleVsCircle(rPos, rRad.radius, oPos, oRad.radius);
    },
  });

  return {
    name: 'collision',
    runAfter: ['movement'],
    run(ctx) {
      trigger.run(ctx);

      const posStore = ctx.world.getStore(PositionDef);
      const tierStore = ctx.world.getStore(RockTierDef);

      for (const { bulletId, rockId } of splits) {
        const tier = tierStore.get(rockId)!.tier;
        const spec = ROCK_TIERS[tier]!;
        const pos = posStore.get(rockId)!;
        ctx.score += spec.score;
        despawn(ctx, rockId);
        despawn(ctx, bulletId);
        if (spec.spawnChildren > 0 && spec.childTier >= 0) {
          for (let i = 0; i < spec.spawnChildren; i++) {
            spawnRock(ctx, pos.x, pos.y, spec.childTier);
          }
        }
      }

      if (shipHit) {
        despawn(ctx, ctx.shipId!);
        ctx.shipId = null;
        ctx.dead = true;
        ctx.events.emit({ type: 'GameOver' });
      }
    },
  };
}

export const collisionSystem: SchedulableSystem<GameState> = makeCollisionSystem();
