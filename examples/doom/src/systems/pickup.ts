import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { HealthDef, PickupDef, PickupTag, Position3DDef, ShapeAabb3DDef } from '../components';

/**
 * Collectibles. When the player's AABB overlaps a {@link PickupTag}, apply its
 * effect (heal, or top up the matching weapon's ammo) and despawn it.
 */
export const pickupSystem: SchedulableSystem<GameState> = {
  name: 'pickup',
  runAfter: ['kinematics3d'],
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const posStore = ctx.world.getStore(Position3DDef);
    const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
    const pickupStore = ctx.world.getStore(PickupDef);
    const healthStore = ctx.world.getStore(HealthDef);

    const pp = posStore.get(ctx.playerId);
    const pa = aabbStore.get(ctx.playerId);
    if (!pp || !pa)
      return;

    for (const id of ctx.world.getTag(PickupTag)) {
      const p = posStore.get(id);
      const a = aabbStore.get(id);
      const pk = pickupStore.get(id);
      if (!p || !a || !pk)
        continue;
      if (Math.abs(pp.x - p.x) > (pa.w + a.w) / 2
        || Math.abs(pp.y - p.y) > (pa.h + a.h) / 2
        || Math.abs(pp.z - p.z) > (pa.d + a.d) / 2) {
        continue;
      }

      if (pk.kind === 0) {
        const ph = healthStore.get(ctx.playerId);
        if (ph)
          ph.hp = Math.min(ph.max, ph.hp + pk.amount);
      }
      else if (pk.kind === 1) {
        ctx.ammo[0] += pk.amount;
      }
      else {
        ctx.ammo[1] += pk.amount;
      }
      ctx.world.queueDestroy(id);
    }
  },
};
