import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { PositionDef, StarTag, VelocityDef } from '../components';
import { STAR_GRAVITY, STAR_GRAVITY_MIN_R } from '../game';

/**
 * Applies inverse-square gravitational acceleration toward the central star
 * for every non-star entity that carries PositionDef + VelocityDef.
 * The star itself is excluded via the StarTag check.
 */
export const gravitySystem: SchedulableSystem<GameState> = {
  name: 'gravity',
  runAfter: ['input'],
  run(ctx) {
    const starTag = ctx.world.getTag(StarTag);
    if (starTag.size === 0)
      return;

    // Find the star position
    let starX = 0;
    let starY = 0;
    for (const starId of starTag) {
      const starPos = ctx.world.getStore(PositionDef).get(starId);
      if (starPos) {
        starX = starPos.x;
        starY = starPos.y;
        break;
      }
    }

    const dt = ctx.dtMs / 1000;
    const velStore = ctx.world.getStore(VelocityDef);
    const posStore = ctx.world.getStore(PositionDef);

    for (const [id] of posStore) {
      // Skip the star itself
      if (starTag.has(id))
        continue;
      const vel = velStore.get(id);
      if (!vel)
        continue;
      const pos = posStore.get(id)!;

      const dx = starX - pos.x;
      const dy = starY - pos.y;
      const distSq = dx * dx + dy * dy;
      const minR2 = STAR_GRAVITY_MIN_R * STAR_GRAVITY_MIN_R;
      const r2 = distSq < minR2 ? minR2 : distSq;
      const r = Math.sqrt(r2);
      const force = STAR_GRAVITY / r2;
      const ax = (dx / r) * force * dt;
      const ay = (dy / r) * force * dt;

      vel.vx += ax;
      vel.vy += ay;
    }
  },
};
