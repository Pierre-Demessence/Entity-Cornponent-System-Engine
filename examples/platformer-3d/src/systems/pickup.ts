import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { makeTriggerSystem } from '@pierre/ecs/modules/collision';

import {
  CoinTag,
  CoinValueDef,
  Position3DDef,
  ShapeAabb3DDef,
} from '../components';
import { despawn } from '../game';

function overlaps3d(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  ah: number,
  ad: number,
  bx: number,
  by: number,
  bz: number,
  bw: number,
  bh: number,
  bd: number,
): boolean {
  return (
    Math.abs(ax - bx) < (aw + bw) / 2
    && Math.abs(ay - by) < (ah + bh) / 2
    && Math.abs(az - bz) < (ad + bd) / 2
  );
}

/**
 * Player↔coin pickup. Brute-force pairs against the small `CoinTag`
 * set; narrowphase is a 3-axis center-based overlap test
 * (component-local because engine `aabbVsAabb` is 2D).
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
    return overlaps3d(
      pp.x,
      pp.y,
      pp.z,
      pa.w,
      pa.h,
      pa.d,
      cp.x,
      cp.y,
      cp.z,
      ca.w,
      ca.h,
      ca.d,
    );
  },
});
