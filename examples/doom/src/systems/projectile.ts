import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { aabb3VsAabb3 } from '@pierre/ecs/modules/collision-3d';

import {
  EnemyTag,
  HealthDef,
  Position3DDef,
  ProjectileDef,
  ProjectileTag,
  ShapeAabb3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from '../components';

/**
 * Advance every {@link ProjectileTag} along its velocity (straight flight, no
 * gravity), damaging the first enemy it overlaps, and despawning on an enemy
 * hit, a wall hit, or when its `ttl` runs out.
 */
export const projectileSystem: SchedulableSystem<GameState> = {
  name: 'projectile',
  runAfter: ['weapon', 'kinematics3d'],
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    const posStore = ctx.world.getStore(Position3DDef);
    const velStore = ctx.world.getStore(Velocity3DDef);
    const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
    const projStore = ctx.world.getStore(ProjectileDef);
    const healthStore = ctx.world.getStore(HealthDef);

    for (const id of ctx.world.getTag(ProjectileTag)) {
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      const proj = projStore.get(id);
      const box = aabbStore.get(id);
      if (!pos || !vel || !proj || !box)
        continue;

      proj.ttl -= ctx.dtMs;
      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;
      pos.z += vel.vz * dt;

      let consumed = false;
      for (const eid of ctx.world.getTag(EnemyTag)) {
        const ep = posStore.get(eid);
        const eb = aabbStore.get(eid);
        if (
          !ep || !eb
          || !aabb3VsAabb3(
            { center: pos, half: { x: box.w / 2, y: box.h / 2, z: box.d / 2 } },
            { center: ep, half: { x: eb.w / 2, y: eb.h / 2, z: eb.d / 2 } },
          )
        ) {
          continue;
        }
        const h = healthStore.get(eid);
        if (h && h.hp <= 0)
          continue; // corpse pending despawn — pass through it
        if (h) {
          h.hp -= proj.damage;
          if (h.hp <= 0)
            ctx.world.queueDestroy(eid);
        }
        consumed = true;
        break;
      }

      if (!consumed) {
        for (const sid of ctx.world.getTag(StaticBodyTag)) {
          const sp = posStore.get(sid);
          const sb = aabbStore.get(sid);
          if (
            sp && sb
            && aabb3VsAabb3(
              { center: pos, half: { x: box.w / 2, y: box.h / 2, z: box.d / 2 } },
              { center: sp, half: { x: sb.w / 2, y: sb.h / 2, z: sb.d / 2 } },
            )
          ) {
            consumed = true;
            break;
          }
        }
      }

      if (consumed || proj.ttl <= 0)
        ctx.world.queueDestroy(id);
    }
  },
};
