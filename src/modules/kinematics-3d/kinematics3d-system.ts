import type { ComponentDef, EntityId, SchedulableSystem, TagDef } from '#index';
import type { Aabb3 } from '../collision-3d/narrowphase3';
import type { Vec3 } from '../math-3d/vec3';

import { aabb3VsAabb3 } from '../collision-3d/narrowphase3';
import { ShapeAabb3Def } from '../collision-3d/shape-aabb3';
import { Grounded3Def } from './grounded';

export interface Kinematics3DTickCtx {
  /** Elapsed time since the previous tick, in milliseconds. */
  readonly dtMs: number;
  readonly world: import('#index').EcsWorld;
}

/**
 * Options for `makeKinematics3DSystem`, the 3D sibling of
 * `makeKinematicsSystem`.
 *
 * The system iterates every entity carrying `dynamicTag` and all of
 * `positionDef`, `velocityDef` and `ShapeAabb3Def` — those are the "dynamic
 * bodies". For each it applies gravity (clamped to `terminalVelocity`), then
 * resolves motion against the colliders yielded by `broadphase`.
 *
 * Resolution is a three-pass axis-separated push-out — X, then Z, then Y —
 * always pushing along the axis of *shallowest* penetration. That is the
 * shortest way out and the only one that cannot tunnel; without it, a body
 * overlapping a large thin wall is pushed out through the wall's wide face, and
 * a floor the body is resting on blocks its horizontal movement. Horizontal
 * axes run before Y so a wall contact cannot cancel a jump on the same tick.
 *
 * `positionDef` / `velocityDef` are injected because the engine has no
 * `modules/transform-3d` yet — the same shape as
 * `makeFollowCameraSystem({ positionDef })`. Nullary defaults belong here once
 * that module ships.
 */
export interface Kinematics3DSystemOptions<TCtx extends Kinematics3DTickCtx> {
  readonly name?: string;
  /** Tag marking the bodies this system simulates. */
  readonly dynamicTag: TagDef;
  /** Downward acceleration in world-units per second², applied as `-y`. */
  readonly gravity: number;
  readonly phase?: string;
  /** Position component to integrate, `{x, y, z}`. */
  readonly positionDef: ComponentDef<Vec3>;
  readonly runAfter?: readonly string[];
  readonly runBefore?: readonly string[];
  /**
   * Tag that identifies immovable obstacles. Supplying it makes the system skip
   * any candidate that does not carry it, which is what makes over-yielding safe
   * for a spatial-index broadphase. Omit it when the broadphase already yields
   * exactly the colliders — a game whose candidate list also carries a movable
   * body that should still block (portal's resting cube).
   */
  readonly staticTag?: TagDef;
  /**
   * Maximum rise (world units) a grounded body auto-climbs instead of being
   * blocked — the character-controller "step offset" (stairs). Omit to disable
   * step-up entirely.
   */
  readonly stepHeight?: number;
  /** Maximum downward speed (the `-vy` cap). */
  readonly terminalVelocity: number;
  /** Velocity component to integrate, `{vx, vy, vz}`. */
  readonly velocityDef: ComponentDef<{ vx: number; vy: number; vz: number }>;
  /**
   * Yields candidate static ids that may overlap `box` — the axis-projected
   * target AABB (world-space, centre + half extents). The system re-tests every
   * candidate with `aabb3VsAabb3` and filters by `staticTag`, so over-yielding
   * is safe (and typical for a spatial index). Called once per axis per body.
   */
  readonly broadphase: (ctx: TCtx, box: Aabb3) => Iterable<EntityId>;
}

interface Velocity3 {
  vx: number;
  vy: number;
  vz: number;
}

interface Box3 {
  d: number;
  h: number;
  w: number;
}

/**
 * Rise at or below this is not a step: a body resting on a ledge is already
 * level with its top, so climbing would be a no-op.
 */
const MIN_STEP_RISE = 0.02;

/**
 * Builds a schedulable system that advances every dynamic body by one physics
 * tick: gravity → X-axis resolve → Z-axis resolve → Y-axis resolve → `onGround`
 * update.
 *
 * The system is stateless; all per-tick scratch lives on the stack.
 */
export function makeKinematics3DSystem<TCtx extends Kinematics3DTickCtx>(
  options: Kinematics3DSystemOptions<TCtx>,
): SchedulableSystem<TCtx> {
  const {
    name = 'kinematics3d',
    broadphase,
    dynamicTag,
    gravity,
    phase,
    positionDef,
    runAfter,
    runBefore,
    staticTag,
    stepHeight,
    terminalVelocity,
    velocityDef,
  } = options;

  const system: SchedulableSystem<TCtx> = {
    name,
    run(ctx) {
      const dt = ctx.dtMs / 1000;
      const posStore = ctx.world.getStore(positionDef);
      const velStore = ctx.world.getStore(velocityDef);
      const aabbStore = ctx.world.getStore(ShapeAabb3Def);
      const groundedStore = ctx.world.getStore(Grounded3Def);
      const staticsFilter = staticTag === undefined ? null : ctx.world.getTag(staticTag);

      // Reused across candidates; the box handed to `broadphase` is a fresh one
      // so a broadphase may hold on to it for the length of its own call.
      const staticBox: Aabb3 = { center: { x: 0, y: 0, z: 0 }, half: { x: 0, y: 0, z: 0 } };

      /**
       * Pushes `pos` out of every candidate overlapping it on `axis`, walking the
       * broadphase once. Earlier push-outs move `pos`, so each candidate is
       * re-tested against the *current* position, not the tick's target.
       */
      function resolveAxis(
        axis: 'x' | 'y' | 'z',
        id: EntityId,
        pos: Vec3,
        aabb: Box3,
        vel: Velocity3,
        grounded: { onGround: boolean } | undefined,
        wasGrounded: boolean,
      ): void {
        const half = { x: aabb.w / 2, y: aabb.h / 2, z: aabb.d / 2 };
        const queryBox: Aabb3 = { center: { x: pos.x, y: pos.y, z: pos.z }, half };
        // Its own `half`: the broadphase is handed `queryBox` alone, and nothing
        // it does to that one may reach the narrowphase below.
        const bodyBox: Aabb3 = { center: { x: pos.x, y: pos.y, z: pos.z }, half: { ...half } };

        for (const sid of broadphase(ctx, queryBox)) {
          if (sid === id || (staticsFilter !== null && !staticsFilter.has(sid)))
            continue;
          const sp = posStore.get(sid);
          const sa = aabbStore.get(sid);
          if (!sp || !sa)
            continue;

          // Re-read from `pos` on every candidate: an earlier push-out, or a
          // step-up, has already moved the body.
          bodyBox.center.x = pos.x;
          bodyBox.center.y = pos.y;
          bodyBox.center.z = pos.z;
          staticBox.center.x = sp.x;
          staticBox.center.y = sp.y;
          staticBox.center.z = sp.z;
          staticBox.half.x = sa.w / 2;
          staticBox.half.y = sa.h / 2;
          staticBox.half.z = sa.d / 2;
          if (!aabb3VsAabb3(bodyBox, staticBox))
            continue;

          const overlapX = half.x + staticBox.half.x - Math.abs(pos.x - sp.x);
          const overlapY = half.y + staticBox.half.y - Math.abs(pos.y - sp.y);
          const overlapZ = half.z + staticBox.half.z - Math.abs(pos.z - sp.z);
          const minOverlap = Math.min(overlapX, overlapY, overlapZ);

          if (axis === 'x') {
            if (overlapX > minOverlap)
              continue;
            if (tryStepUp(pos, half.y, sp, sa, vel, grounded, wasGrounded))
              continue;
            pos.x += pos.x < sp.x ? -overlapX : overlapX;
            vel.vx = 0;
          }
          else if (axis === 'z') {
            if (overlapZ > minOverlap)
              continue;
            if (tryStepUp(pos, half.y, sp, sa, vel, grounded, wasGrounded))
              continue;
            pos.z += pos.z < sp.z ? -overlapZ : overlapZ;
            vel.vz = 0;
          }
          else {
            if (overlapY > minOverlap)
              continue;
            if (pos.y < sp.y) {
              pos.y -= overlapY;
            }
            else {
              pos.y += overlapY;
              if (grounded)
                grounded.onGround = true;
            }
            vel.vy = 0;
          }
        }
      }

      /**
       * Lifts a grounded body onto a ledge it just ran into, when the ledge's
       * top is within `stepHeight` of its feet — the classic character-controller
       * step offset. Returns whether it climbed (the caller then skips the
       * blocking push-out). Never resolves the Y axis: stepping is horizontal
       * movement, so only X and Z call this.
       */
      function tryStepUp(
        pos: Vec3,
        halfH: number,
        sp: Vec3,
        sa: Box3,
        vel: Velocity3,
        grounded: { onGround: boolean } | undefined,
        wasGrounded: boolean,
      ): boolean {
        if (stepHeight === undefined || !grounded || !wasGrounded)
          return false;
        const stepTop = sp.y + sa.h / 2;
        const rise = stepTop - (pos.y - halfH);
        if (rise <= MIN_STEP_RISE || rise > stepHeight)
          return false;
        pos.y = stepTop + halfH;
        grounded.onGround = true;
        if (vel.vy < 0)
          vel.vy = 0;
        return true;
      }

      for (const id of ctx.world.getTag(dynamicTag)) {
        const pos = posStore.get(id);
        const vel = velStore.get(id);
        const aabb = aabbStore.get(id);
        if (!pos || !vel || !aabb)
          continue;

        const grounded = groundedStore.get(id);
        // You cannot climb a step mid-jump, so step-up is gated on last tick's
        // ground contact. Read before `onGround` is cleared below.
        const wasGrounded = grounded?.onGround ?? false;

        vel.vy -= gravity * dt;
        if (vel.vy < -terminalVelocity)
          vel.vy = -terminalVelocity;

        if (grounded)
          grounded.onGround = false;

        pos.x += vel.vx * dt;
        resolveAxis('x', id, pos, aabb, vel, grounded, wasGrounded);

        pos.z += vel.vz * dt;
        resolveAxis('z', id, pos, aabb, vel, grounded, wasGrounded);

        pos.y += vel.vy * dt;
        resolveAxis('y', id, pos, aabb, vel, grounded, wasGrounded);
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
