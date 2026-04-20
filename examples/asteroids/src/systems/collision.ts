import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import {
  BulletTag,
  PositionDef,
  RadiusDef,
  RockTag,
  RockTierDef,
} from '../components';
import {
  cellOf,
  despawn,

  ROCK_TIERS,
  spawnRock,
} from '../game';

export const collisionSystem: SchedulableSystem<GameState> = {
  name: 'collision',
  runAfter: ['movement'],
  run(ctx) {
    const posStore = ctx.world.getStore(PositionDef);
    const radStore = ctx.world.getStore(RadiusDef);
    const tierStore = ctx.world.getStore(RockTierDef);
    const rockTag = ctx.world.getTag(RockTag);
    const bulletTag = ctx.world.getTag(BulletTag);

    const destroyed = new Set<EntityId>();
    const splits: { rockId: EntityId; bulletId: EntityId }[] = [];
    let shipHit = false;

    for (const rockId of rockTag) {
      if (destroyed.has(rockId))
        continue;
      const rPos = posStore.get(rockId)!;
      const rRad = radStore.get(rockId)!.r;
      const rCell = cellOf(rPos.x, rPos.y);

      for (const otherId of ctx.grid.queryNear(rCell, 2)) {
        if (otherId === rockId || destroyed.has(otherId))
          continue;
        const oPos = posStore.get(otherId);
        const oRad = radStore.get(otherId);
        if (!oPos || !oRad)
          continue;

        const dx = oPos.x - rPos.x;
        const dy = oPos.y - rPos.y;
        const rr = rRad + oRad.r;
        if (dx * dx + dy * dy > rr * rr)
          continue;

        if (bulletTag.has(otherId)) {
          splits.push({ bulletId: otherId, rockId });
          destroyed.add(rockId);
          destroyed.add(otherId);
          break;
        }
        else if (ctx.shipId === otherId) {
          shipHit = true;
          destroyed.add(otherId);
          break;
        }
      }
    }

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
