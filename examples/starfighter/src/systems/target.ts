import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { vec3ClampLength, vec3Dot, vec3Normalize, vec3Reflect } from '@pierre/ecs/modules/math';
import { tickSpawner } from '@pierre/ecs/modules/spawner';

import { Position3DDef, TargetTag, Velocity3DDef } from '../components';
import { BOUNDS_RADIUS, spawnTarget, TARGET_RADIUS } from '../game';

/**
 * Bounces each drifting target drone off the spherical boundary and tops the
 * field back up to `TARGET_CAP` on the game's target spawner so the arena never empties
 * out. Position is integrated by the shared `motion` system.
 */
export const targetSystem: SchedulableSystem<GameState> = {
  name: 'target',
  runAfter: ['bullet'],
  run(ctx) {
    const posStore = ctx.world.getStore(Position3DDef);
    const velStore = ctx.world.getStore(Velocity3DDef);

    const limit = BOUNDS_RADIUS - TARGET_RADIUS;
    for (const id of ctx.world.getTag(TargetTag)) {
      const pos = posStore.get(id);
      const vel = velStore.get(id);
      if (!pos || !vel)
        continue;

      const clamped = vec3ClampLength(pos, limit);
      if (clamped === pos)
        continue;
      const normal = vec3Normalize(pos);
      Object.assign(pos, clamped);
      const v = { x: vel.vx, y: vel.vy, z: vel.vz };
      if (vec3Dot(v, normal) > 0) {
        const bounced = vec3Reflect(v, normal);
        vel.vx = bounced.x;
        vel.vy = bounced.y;
        vel.vz = bounced.z;
      }
    }

    tickSpawner(ctx.targetSpawner, ctx.dtMs, () => {
      spawnTarget(ctx);
      ctx.events.emit({ type: 'TargetSpawned' });
    });
  },
};
