import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { Position3DDef, TargetTag, Velocity3DDef } from '../components';
import { BOUNDS_RADIUS, spawnTarget, TARGET_CAP, TARGET_RADIUS, TARGET_SPAWN_MS } from '../game';

/**
 * Drifts each target drone along its velocity, bounces it off the spherical
 * boundary, and tops the field back up to {@link TARGET_CAP} on a timer so the
 * arena never empties out.
 */
export const targetSystem: SchedulableSystem<GameState> = {
  name: 'target',
  runAfter: ['bullet'],
  run(ctx) {
    const dt = ctx.dtMs / 1000;
    const posStore = ctx.world.getStore(Position3DDef);
    const velStore = ctx.world.getStore(Velocity3DDef);

    for (const id of ctx.world.getTag(TargetTag)) {
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      if (!pos || !vel)
        continue;

      pos.x += vel.vx * dt;
      pos.y += vel.vy * dt;
      pos.z += vel.vz * dt;

      const limit = BOUNDS_RADIUS - TARGET_RADIUS;
      const dist = Math.hypot(pos.x, pos.y, pos.z);
      if (dist > limit && dist > 0) {
        const nx = pos.x / dist;
        const ny = pos.y / dist;
        const nz = pos.z / dist;
        pos.x = nx * limit;
        pos.y = ny * limit;
        pos.z = nz * limit;
        const outward = vel.vx * nx + vel.vy * ny + vel.vz * nz;
        if (outward > 0) {
          vel.vx -= 2 * outward * nx;
          vel.vy -= 2 * outward * ny;
          vel.vz -= 2 * outward * nz;
        }
      }
    }

    ctx.spawnTimer -= ctx.dtMs;
    if (ctx.spawnTimer <= 0 && ctx.world.getTag(TargetTag).size < TARGET_CAP) {
      spawnTarget(ctx);
      ctx.events.emit({ type: 'TargetSpawned' });
      ctx.spawnTimer = TARGET_SPAWN_MS;
    }
  },
};
