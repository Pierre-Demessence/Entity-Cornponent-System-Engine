import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState, Vec3 } from '../game';

import {
  AiDef,
  EnemyTag,
  HealthDef,
  Position3DDef,
  ShapeAabb3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from '../components';
import {
  ENEMY_ATTACK_COOLDOWN_MS,
  ENEMY_ATTACK_RANGE,
  ENEMY_DAMAGE,
  ENEMY_DETECT_RANGE,
  ENEMY_SPEED,
} from '../game';
import { rayAabb } from './math';

interface Box3 { d: number; h: number; w: number }
interface StaticBox { b: Box3; p: Vec3 }

/**
 * Enemy brain. Each {@link EnemyTag} stays idle until the player is within
 * {@link ENEMY_DETECT_RANGE} *and* in line of sight (no static blocks the ray),
 * then chases on the XZ plane; within {@link ENEMY_ATTACK_RANGE} it stops and
 * attacks on a cadence. Runs before `kinematics3d`, which moves the body it
 * steers (gravity + wall collision). Billboard sprites always face the camera,
 * so there's no heading to set. (Attacks deal player damage in M5.)
 */
export const aiSystem: SchedulableSystem<GameState> = {
  name: 'ai',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const posStore = ctx.world.getStore(Position3DDef);
    const velStore = ctx.world.getStore(Velocity3DDef);
    const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
    const aiStore = ctx.world.getStore(AiDef);
    const healthStore = ctx.world.getStore(HealthDef);

    const ppos = posStore.get(ctx.playerId);
    if (!ppos)
      return;

    // Static occluders for line-of-sight.
    const statics: StaticBox[] = [];
    for (const sid of ctx.world.getTag(StaticBodyTag)) {
      const p = posStore.get(sid);
      const b = aabbStore.get(sid);
      if (p && b)
        statics.push({ b, p });
    }

    for (const id of ctx.world.getTag(EnemyTag)) {
      const epos = posStore.get(id);
      const evel = velStore.get(id);
      const ai = aiStore.get(id);
      if (!epos || !evel || !ai)
        continue;
      const eh = healthStore.get(id);
      if (eh && eh.hp <= 0)
        continue; // killed earlier this tick; despawn is deferred to the flush

      if (ai.attackTimer > 0)
        ai.attackTimer -= ctx.dtMs;

      const dx = ppos.x - epos.x;
      const dy = ppos.y - epos.y;
      const dz = ppos.z - epos.z;
      const dist = Math.hypot(dx, dy, dz);
      const distXZ = Math.hypot(dx, dz);

      if (dist > ENEMY_DETECT_RANGE || !inSight(epos, dist, dx, dy, dz, statics)) {
        ai.mode = 0; // idle
        evel.vx = 0;
        evel.vz = 0;
        continue;
      }

      if (distXZ <= ENEMY_ATTACK_RANGE) {
        ai.mode = 2; // attack
        evel.vx = 0;
        evel.vz = 0;
        if (ai.attackTimer <= 0) {
          ai.attackTimer = ENEMY_ATTACK_COOLDOWN_MS;
          if (!ctx.dead && ctx.playerId != null) {
            const ph = healthStore.get(ctx.playerId);
            if (ph) {
              ph.hp -= ENEMY_DAMAGE;
              if (ph.hp <= 0) {
                ph.hp = 0;
                ctx.dead = true;
              }
            }
          }
        }
      }
      else {
        ai.mode = 1; // chase
        const inv = distXZ > 1e-3 ? 1 / distXZ : 0;
        evel.vx = dx * inv * ENEMY_SPEED;
        evel.vz = dz * inv * ENEMY_SPEED;
      }
    }
  },
};

/** True if no static blocks the straight line from the enemy to the player. */
function inSight(from: Vec3, dist: number, dx: number, dy: number, dz: number, statics: StaticBox[]): boolean {
  const inv = 1 / (dist || 1);
  const dir = { x: dx * inv, y: dy * inv, z: dz * inv };
  for (const { b, p } of statics) {
    const hit = rayAabb(from, dir, p, { x: b.w / 2, y: b.h / 2, z: b.d / 2 });
    if (hit && hit.t < dist - 0.5)
      return false;
  }
  return true;
}
