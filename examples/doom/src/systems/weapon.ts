import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState, Vec3 } from '../game';

import { EnemyTag, HealthDef, Position3DDef, ShapeAabb3DDef, StaticBodyTag } from '../components';
import {
  HITSCAN_COOLDOWN_MS,
  HITSCAN_DAMAGE,
  HITSCAN_RANGE,
  PLAYER_EYE,
  PROJECTILE_COOLDOWN_MS,
  spawnProjectile,
} from '../game';
import { forwardVec, rayAabb } from './math';

/**
 * Player weapons, fired while {@link GameState.firing} (LMB) and gated by a
 * per-shot cooldown. Weapon 0 is **hitscan** — an instant ray that damages the
 * nearest enemy in front of any wall, leaving a brief tracer. Weapon 1 is a
 * **projectile** — spawns a travelling bolt (see `projectileSystem`). Keys 1/2
 * switch. (Ammo gating arrives with the HUD in M5.)
 */
export const weaponSystem: SchedulableSystem<GameState> = {
  name: 'weapon',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.input.justPressed('weapon1'))
      ctx.weapon = 0;
    if (ctx.input.justPressed('weapon2'))
      ctx.weapon = 1;

    if (ctx.fireTimer > 0)
      ctx.fireTimer -= ctx.dtMs;
    if (ctx.tracer) {
      ctx.tracer.ttl -= ctx.dtMs;
      if (ctx.tracer.ttl <= 0)
        ctx.tracer = null;
    }

    if (ctx.dead || ctx.playerId == null || !ctx.firing || ctx.fireTimer > 0)
      return;
    if (ctx.ammo[ctx.weapon] <= 0)
      return; // out of ammo for this weapon
    const ppos = ctx.world.getStore(Position3DDef).get(ctx.playerId);
    if (!ppos)
      return;

    const eye: Vec3 = { x: ppos.x, y: ppos.y + PLAYER_EYE, z: ppos.z };
    const dir = forwardVec(ctx.yaw, ctx.pitch);

    if (ctx.weapon === 1) {
      spawnProjectile(
        ctx,
        { x: eye.x + dir.x * 0.6, y: eye.y + dir.y * 0.6, z: eye.z + dir.z * 0.6 },
        dir,
      );
      ctx.fireTimer = PROJECTILE_COOLDOWN_MS;
      ctx.ammo[1] -= 1;
      return;
    }

    fireHitscan(ctx, eye, dir);
    ctx.fireTimer = HITSCAN_COOLDOWN_MS;
    ctx.ammo[0] -= 1;
  },
};

function fireHitscan(ctx: GameState, eye: Vec3, dir: Vec3): void {
  const posStore = ctx.world.getStore(Position3DDef);
  const aabbStore = ctx.world.getStore(ShapeAabb3DDef);
  const healthStore = ctx.world.getStore(HealthDef);

  // Walls stop the ray; the closest wall is the max reach for this shot.
  let blockT = HITSCAN_RANGE;
  for (const sid of ctx.world.getTag(StaticBodyTag)) {
    const p = posStore.get(sid);
    const b = aabbStore.get(sid);
    if (!p || !b)
      continue;
    const hit = rayAabb(eye, dir, p, { x: b.w / 2, y: b.h / 2, z: b.d / 2 });
    if (hit && hit.t < blockT)
      blockT = hit.t;
  }

  // Nearest enemy in front of that wall.
  let bestT = blockT;
  let bestEnemy: number | null = null;
  for (const id of ctx.world.getTag(EnemyTag)) {
    const p = posStore.get(id);
    const b = aabbStore.get(id);
    if (!p || !b)
      continue;
    const h = healthStore.get(id);
    if (h && h.hp <= 0)
      continue; // already killed this tick (pending despawn)
    const hit = rayAabb(eye, dir, p, { x: b.w / 2, y: b.h / 2, z: b.d / 2 });
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      bestEnemy = id;
    }
  }

  ctx.tracer = {
    from: { x: eye.x, y: eye.y, z: eye.z },
    to: { x: eye.x + dir.x * bestT, y: eye.y + dir.y * bestT, z: eye.z + dir.z * bestT },
    ttl: 60,
  };

  if (bestEnemy != null) {
    const h = healthStore.get(bestEnemy);
    if (h) {
      h.hp -= HITSCAN_DAMAGE;
      if (h.hp <= 0)
        ctx.world.queueDestroy(bestEnemy);
    }
  }
}
