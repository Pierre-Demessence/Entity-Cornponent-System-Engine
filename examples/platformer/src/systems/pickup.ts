import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import {
  AabbDef,
  CoinTag,
  CoinValueDef,
  PositionDef,
} from '../components';
import { despawn } from '../game';
import { aabbOverlap } from '../math';

export const pickupSystem: SchedulableSystem<GameState> = {
  name: 'pickup',
  runAfter: ['physics'],
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const pPos = ctx.world.getStore(PositionDef).get(ctx.playerId)!;
    const pAabb = ctx.world.getStore(AabbDef).get(ctx.playerId)!;
    const posStore = ctx.world.getStore(PositionDef);
    const aabbStore = ctx.world.getStore(AabbDef);
    const valueStore = ctx.world.getStore(CoinValueDef);

    const collected: number[] = [];
    for (const coinId of ctx.world.getTag(CoinTag)) {
      const cp = posStore.get(coinId)!;
      const ca = aabbStore.get(coinId)!;
      if (!aabbOverlap(pPos.x, pPos.y, pAabb.w, pAabb.h, cp.x, cp.y, ca.w, ca.h))
        continue;
      const value = valueStore.get(coinId)!.score;
      ctx.score += value;
      collected.push(coinId);
      ctx.events.emit({ coinId, score: value, type: 'CoinCollected' });
    }
    for (const id of collected) despawn(ctx, id);
  },
};
