import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { sphere3ContainsPoint, sphere3VsSphere3 } from '@pierre/ecs/modules/collision-3d';

import { BulletDef, BulletTag, Position3DDef, RadiusDef, TargetTag, Velocity3DDef } from '../components';
import { BOUNDS_RADIUS } from '../game';

/**
 * Advances every bullet along its velocity, expires it on TTL or when it
 * leaves the play boundary, and destroys the first target it overlaps
 * (sphere-vs-sphere). A hit removes both bodies and scores a point.
 */
export const bulletSystem: SchedulableSystem<GameState> = {
  name: 'bullet',
  runAfter: ['weapon'],
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    const posStore = ctx.world.getStore(Position3DDef);
    const velStore = ctx.world.getStore(Velocity3DDef);
    const radStore = ctx.world.getStore(RadiusDef);
    const bulletStore = ctx.world.getStore(BulletDef);

    const destroyed = new Set<EntityId>();

    for (const id of ctx.world.getTag(BulletTag)) {
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      const rad = radStore.get(id);
      const bullet = bulletStore.get(id);
      if (!pos || !vel || !rad || !bullet)
        continue;

      bullet.ttl -= ctx.dtMs;
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;
      pos.z += vel.vz * dt;

      if (bullet.ttl <= 0 || !sphere3ContainsPoint({ x: 0, y: 0, z: 0 }, BOUNDS_RADIUS, pos)) {
        ctx.world.queueDestroy(id);
        continue;
      }

      for (const tid of ctx.world.getTag(TargetTag)) {
        if (destroyed.has(tid))
          continue;
        const tp = posStore.get(tid);
        const tr = radStore.get(tid);
        if (!tp || !tr)
          continue;
        if (sphere3VsSphere3(pos, rad.r, tp, tr.r)) {
          destroyed.add(tid);
          ctx.world.queueDestroy(tid);
          ctx.world.queueDestroy(id);
          ctx.score += 1;
          ctx.events.emit({ score: ctx.score, type: 'TargetDestroyed' });
          break;
        }
      }
    }
  },
};
