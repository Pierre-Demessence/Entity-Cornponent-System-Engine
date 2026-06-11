import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

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

interface Vec3 { x: number; y: number; z: number }
interface Box3 { d: number; h: number; w: number }

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
        if (!ep || !eb || !overlaps(pos, box, ep, eb))
          continue;
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
          if (sp && sb && overlaps(pos, box, sp, sb)) {
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

function overlaps(pa: Vec3, a: Box3, pb: Vec3, b: Box3): boolean {
  return Math.abs(pa.x - pb.x) <= (a.w + b.w) / 2
    && Math.abs(pa.y - pb.y) <= (a.h + b.h) / 2
    && Math.abs(pa.z - pb.z) <= (a.d + b.d) / 2;
}
