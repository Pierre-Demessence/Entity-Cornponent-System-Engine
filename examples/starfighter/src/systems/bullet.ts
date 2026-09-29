import type { EntityId, SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { sphere3ContainsPoint, sphere3VsSphere3 } from '@pierre/ecs/modules/collision-3d';

import { BulletTag, Position3DDef, ShapeSphere3Def, TargetTag } from '../components';
import { BOUNDS_RADIUS } from '../game';

/**
 * Expires each bullet when it leaves the play boundary (its TTL is a
 * `LifetimeDef`), and destroys
 * the first target it overlaps (sphere-vs-sphere). A hit removes both bodies
 * and scores a point. Position is integrated by the shared `motion` system.
 */
export const bulletSystem: SchedulableSystem<GameState> = {
  name: 'bullet',
  runAfter: ['motion'],
  run(ctx) {
    const posStore = ctx.world.getStore(Position3DDef);
    const radStore = ctx.world.getStore(ShapeSphere3Def);

    const destroyed = new Set<EntityId>();

    for (const id of ctx.world.getTag(BulletTag)) {
      const pos = posStore.get(id);
      const rad = radStore.get(id);
      if (!pos || !rad)
        continue;

      if (!sphere3ContainsPoint({ x: 0, y: 0, z: 0 }, BOUNDS_RADIUS, pos)) {
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
        if (sphere3VsSphere3(pos, rad.radius, tp, tr.radius)) {
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
