import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { aabb3VsAabb3 } from '@pierre/ecs/modules/collision-3d';
import { makeVelocityIntegration3DSystem } from '@pierre/ecs/modules/motion-3d';

import {
  EnemyTag,
  HealthDef,
  Position3DDef,
  ProjectileDef,
  ProjectileTag,
  ShapeAabb3DDef,
  StaticBodyTag,
} from '../components';

/**
 * Straight-line flight for {@link ProjectileTag} bodies (no gravity), scoped by
 * tag so it never touches the kinematics-driven player/enemies. Runs after the
 * weapon so a bolt spawned this tick also moves this tick.
 */
export const projectileMotionSystem: SchedulableSystem<GameState>
  = makeVelocityIntegration3DSystem<GameState>({
    name: 'projectile-motion',
    runAfter: ['weapon'],
    tag: ProjectileTag,
  });

/**
 * Damage the first enemy each {@link ProjectileTag} overlaps and despawn it on
 * an enemy hit, a wall hit, or when its `ttl` runs out. Motion is handled by
 * {@link projectileMotionSystem}; this reads the already-integrated position.
 */
export const projectileSystem: SchedulableSystem<GameState> = {
  name: 'projectile',
  runAfter: ['projectile-motion', 'kinematics3d'],
  run(ctx) {
    const posStore = ctx.world.getStore(Position3DDef);
    const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
    const projStore = ctx.world.getStore(ProjectileDef);
    const healthStore = ctx.world.getStore(HealthDef);

    for (const id of ctx.world.getTag(ProjectileTag)) {
      const pos = posStore.get(id);
      const proj = projStore.get(id);
      const box = aabbStore.get(id);
      if (!pos || !proj || !box)
        continue;

      proj.ttl -= ctx.dtMs;

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
