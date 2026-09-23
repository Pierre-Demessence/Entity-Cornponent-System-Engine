import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { makeTriggerSystem } from '@pierre/ecs/modules/collision';
import { aabb3VsAabb3 } from '@pierre/ecs/modules/collision-3d';

import {
  CoinTag,
  CoinValueDef,
  Position3DDef,
  ShapeAabb3DDef,
} from '../components';
import { despawn } from '../game';

/**
 * Player↔coin pickup. Brute-force pairs against the small `CoinTag` set; the
 * narrowphase is the engine's 3D box overlap.
 */
export const pickupSystem: SchedulableSystem<GameState> = makeTriggerSystem<GameState>({
  name: 'pickup',
  runAfter: ['kinematics3d'],
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
    const posStore = ctx.world.getStore(Position3DDef);
    const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
    const pp = posStore.get(player)!;
    const pa = aabbStore.get(player)!;
    const cp = posStore.get(coinId)!;
    const ca = aabbStore.get(coinId)!;
    return aabb3VsAabb3(
      { center: pp, half: { x: pa.w / 2, y: pa.h / 2, z: pa.d / 2 } },
      { center: cp, half: { x: ca.w / 2, y: ca.h / 2, z: ca.d / 2 } },
    );
  },
});
