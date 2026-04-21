import type { EntityId, SchedulableSystem, TagDef } from '#index';

import { aabbVsAabb } from '../collision/narrowphase';
import { ShapeAabbDef } from '../collision/shape-aabb';
import { PositionDef } from '../transform/position';
import { VelocityDef } from '../transform/velocity';
import { GroundedDef } from './grounded';

export interface KinematicsTickCtx {
  /** Elapsed time since the previous tick, in milliseconds. */
  readonly dtMs: number;
  readonly world: import('#index').EcsWorld;
}

/**
 * Options for `makeKinematicsSystem`.
 *
 * The system iterates every entity that carries all of
 * `Position`, `Velocity`, `ShapeAabb`, and `Grounded` — those are the
 * "dynamic bodies". For each, it applies gravity (clamped to
 * `terminalVelocity` on the way down), then resolves motion against
 * any entity yielded by `broadphase` that also carries `staticTag`.
 *
 * Resolution uses a two-pass axis-separated push-out: X first, then
 * Y. Against each overlapping static, the body is snapped to the
 * nearest non-penetrating edge and the corresponding velocity
 * component is zeroed. This mirrors Arcade-style platformer physics
 * and avoids the tunneling pathologies of a naive overlap check.
 *
 * `broadphase` is called once per axis per body with the axis-projected
 * target AABB. Consumers typically dispatch a spatial-grid or tag
 * iterator here.
 */
export interface KinematicsSystemOptions<TCtx extends KinematicsTickCtx> {
  readonly name?: string;
  /** Downward acceleration in world-units per second². */
  readonly gravity: number;
  readonly phase?: string;
  readonly runAfter?: readonly string[];
  readonly runBefore?: readonly string[];
  /** Tag that identifies immovable obstacles. */
  readonly staticTag: TagDef;
  /** Maximum positive `vy` (falling speed cap). */
  readonly terminalVelocity: number;
  /**
   * Yields candidate static-body ids that may overlap the given AABB.
   * The system filters the results by `staticTag`, so over-yielding
   * is safe (and typical for grid broadphases).
   */
  readonly broadphase: (
    ctx: TCtx,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => Iterable<EntityId>;
}

/**
 * Builds a schedulable system that advances every dynamic body by
 * one physics tick: gravity → X-axis resolve → Y-axis resolve →
 * `onGround` update.
 *
 * The system is stateless; all per-tick scratch lives on the stack.
 */
export function makeKinematicsSystem<TCtx extends KinematicsTickCtx>(
  options: KinematicsSystemOptions<TCtx>,
): SchedulableSystem<TCtx> {
  const {
    name = 'kinematics',
    broadphase,
    gravity,
    phase,
    runAfter,
    runBefore,
    staticTag,
    terminalVelocity,
  } = options;

  const system: SchedulableSystem<TCtx> = {
    name,
    run(ctx) {
      const dt = ctx.dtMs / 1000;
      const posStore = ctx.world.getStore(PositionDef);
      const velStore = ctx.world.getStore(VelocityDef);
      const aabbStore = ctx.world.getStore(ShapeAabbDef);
      const groundedStore = ctx.world.getStore(GroundedDef);
      const statics = ctx.world.getTag(staticTag);

      for (const [id, grounded] of groundedStore) {
        const pos = posStore.get(id);
        const vel = velStore.get(id);
        const aabb = aabbStore.get(id);
        if (!pos || !vel || !aabb)
          continue;

        vel.vy = Math.min(vel.vy + gravity * dt, terminalVelocity);

        const dx = vel.vx * dt;
        if (dx !== 0) {
          const origX = pos.x + dx;
          let targetX = origX;
          for (const sid of broadphase(ctx, origX, pos.y, aabb.w, aabb.h)) {
            if (!statics.has(sid) || sid === id)
              continue;
            const sp = posStore.get(sid);
            const sa = aabbStore.get(sid);
            if (!sp || !sa)
              continue;
            if (!aabbVsAabb(
              { h: aabb.h, w: aabb.w, x: origX, y: pos.y },
              { h: sa.h, w: sa.w, x: sp.x, y: sp.y },
            )) {
              continue;
            }
            if (dx > 0)
              targetX = Math.min(targetX, sp.x - aabb.w);
            else targetX = Math.max(targetX, sp.x + sa.w);
            vel.vx = 0;
          }
          pos.x = targetX;
        }

        const dy = vel.vy * dt;
        if (dy !== 0) {
          grounded.onGround = false;
          const origY = pos.y + dy;
          let targetY = origY;
          for (const sid of broadphase(ctx, pos.x, origY, aabb.w, aabb.h)) {
            if (!statics.has(sid) || sid === id)
              continue;
            const sp = posStore.get(sid);
            const sa = aabbStore.get(sid);
            if (!sp || !sa)
              continue;
            if (!aabbVsAabb(
              { h: aabb.h, w: aabb.w, x: pos.x, y: origY },
              { h: sa.h, w: sa.w, x: sp.x, y: sp.y },
            )) {
              continue;
            }
            if (dy > 0) {
              targetY = Math.min(targetY, sp.y - aabb.h);
              grounded.onGround = true;
            }
            else {
              targetY = Math.max(targetY, sp.y + sa.h);
            }
            vel.vy = 0;
          }
          pos.y = targetY;
        }
      }
    },
  };

  return {
    ...system,
    ...(phase === undefined ? {} : { phase }),
    ...(runAfter === undefined ? {} : { runAfter }),
    ...(runBefore === undefined ? {} : { runBefore }),
  };
}
