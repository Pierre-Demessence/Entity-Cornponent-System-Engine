import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { aabbVsAabb, makeTriggerSystem } from '@pierre/ecs/modules/collision';

import {
  CoinTag,
  CoinValueDef,
  PositionDef,
  ShapeAabbDef,
} from '../components';
import { despawn } from '../game';

/**
 * Player↔coin pickup. Broadphase snapshots `(player, coin)` pairs so
 * that `onOverlap` can despawn coins without invalidating the tag
 * iterator; the narrowphase is the shared AABB overlap helper.
 */
export const pickupSystem: SchedulableSystem<GameState> = makeTriggerSystem<GameState>({
  name: 'pickup',
  runAfter: ['kinematics'],
  broadphase(ctx) {
    if (ctx.playerId == null)
      return [];
    const playerId = ctx.playerId;
    const pairs: Array<readonly [EntityId, EntityId]> = [];
    for (const coinId of ctx.world.getTag(CoinTag))
      pairs.push([playerId, coinId] as const);
    return pairs;
  },
  onOverlap(ctx, _player, coinId) {
    const value = ctx.world.getStore(CoinValueDef).get(coinId)!.score;
    ctx.score += value;
    ctx.events.emit({ coinId, score: value, type: 'CoinCollected' });
    despawn(ctx, coinId);
  },
  overlaps(ctx, player, coinId) {
    const posStore = ctx.world.getStore(PositionDef);
    const aabbStore = ctx.world.getStore(ShapeAabbDef);
    const pp = posStore.get(player)!;
    const pa = aabbStore.get(player)!;
    const cp = posStore.get(coinId)!;
    const ca = aabbStore.get(coinId)!;
    return aabbVsAabb(
      { h: pa.h, w: pa.w, x: pp.x, y: pp.y },
      { h: ca.h, w: ca.w, x: cp.x, y: cp.y },
    );
  },
});
