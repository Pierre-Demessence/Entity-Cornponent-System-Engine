import type { EntityId, SchedulableSystem, TagDef } from '#index';
import type { Position3D } from '../transform-3d/position3d';

import { ColumnStore } from '#column-store';

import { Position3DDef } from '../transform-3d/position3d';
import { Velocity3DDef } from '../transform-3d/velocity3d';

export interface Bounds3D { depth: number; height: number; width: number }

/**
 * Boundary behavior when a moving entity's position leaves
 * `[0, width) x [0, height) x [0, depth)` after integration. The 3D sibling of
 * the 2D `VelocityIntegrationBoundary`: `wrap` is toroidal, `clamp` pins the
 * coordinate to the edge.
 */
export type VelocityIntegration3DBoundary
  = | { mode: 'wrap'; bounds: Bounds3D }
    | { mode: 'clamp'; bounds: Bounds3D };

export interface VelocityIntegration3DTickCtx {
  /** Elapsed time since the previous tick, in milliseconds. */
  dtMs: number;
  world: import('#index').EcsWorld;
}

export interface VelocityIntegration3DOptions<TCtx extends VelocityIntegration3DTickCtx> {
  name?: string;
  boundary?: VelocityIntegration3DBoundary;
  runAfter?: string[];
  /**
   * Integrate only entities carrying this tag (in addition to having
   * `Position3D` + `Velocity3D`). Unset integrates every velocity entity. The
   * marker/query-filter idiom — Bevy `With<T>`, and this engine's own
   * `kinematics-3d` `dynamicTag` — so a game that runs `kinematics-3d` over its
   * bodies can still integrate a disjoint set (e.g. projectiles) without
   * double-integrating the kinematic ones.
   */
  tag?: TagDef;
  /**
   * Invoked once per entity whose position actually changed this tick, after
   * any boundary handling. The `prev` snapshot is a plain value object, not the
   * store entry itself, so it is safe to retain — the escape hatch for games
   * keeping a separate spatial index or dirty-flag queue in sync.
   */
  onMove?: (
    ctx: TCtx,
    id: EntityId,
    prev: Readonly<Position3D>,
    next: Readonly<Position3D>,
  ) => void;
}

function applyBoundary(
  value: number,
  max: number,
  mode: 'wrap' | 'clamp',
): number {
  if (mode === 'clamp')
    return value < 0 ? 0 : value > max ? max : value;
  const m = ((value % max) + max) % max;
  return m;
}

/**
 * The 3D sibling of `makeVelocityIntegrationSystem`: advances `Position3D` by
 * `Velocity3D` each tick, with optional 3D boundary `wrap`/`clamp`, `tag`-
 * scoping, and an `onMove` hook.
 */
export function makeVelocityIntegration3DSystem<TCtx extends VelocityIntegration3DTickCtx>(
  options: VelocityIntegration3DOptions<TCtx> = {},
): SchedulableSystem<TCtx> {
  const { name = 'motion3d', boundary, onMove, runAfter, tag } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const dt = ctx.dtMs / 1000;
      if (dt === 0)
        return;
      const posStore = ctx.world.getStore(Position3DDef);
      const velStore = ctx.world.getStore(Velocity3DDef);
      // Marker-scoped when `tag` is set (iterate that small subset), else every
      // velocity entity — matching `kinematics-3d`'s `dynamicTag` iteration.
      const source: Iterable<EntityId> = tag ? ctx.world.getTag(tag) : velStore.keys();

      // Columnar fast path: when both stores are Structure-of-Arrays, integrate
      // directly over the typed-array columns — no per-entity view allocation.
      // Behaviour matches the object path exactly (boundary, skip-if-still,
      // onMove); direct column writes mark the entity dirty like the view setter.
      // Column refs are captured once, so `onMove` must not add new Position3D/
      // Velocity3D entities (that would grow() and reallocate the columns).
      if (posStore instanceof ColumnStore && velStore instanceof ColumnStore) {
        const px = posStore.column('x');
        const py = posStore.column('y');
        const pz = posStore.column('z');
        const vx = velStore.column('vx');
        const vy = velStore.column('vy');
        const vz = velStore.column('vz');
        for (const id of source) {
          const vs = velStore.slotOf(id);
          if (vs === undefined)
            continue;
          const dx = vx[vs] * dt;
          const dy = vy[vs] * dt;
          const dz = vz[vs] * dt;
          if (dx === 0 && dy === 0 && dz === 0)
            continue;
          const ps = posStore.slotOf(id);
          if (ps === undefined)
            continue;
          const prevX = px[ps];
          const prevY = py[ps];
          const prevZ = pz[ps];
          let nextX = prevX + dx;
          let nextY = prevY + dy;
          let nextZ = prevZ + dz;
          if (boundary) {
            nextX = applyBoundary(nextX, boundary.bounds.width, boundary.mode);
            nextY = applyBoundary(nextY, boundary.bounds.height, boundary.mode);
            nextZ = applyBoundary(nextZ, boundary.bounds.depth, boundary.mode);
          }
          if (nextX === prevX && nextY === prevY && nextZ === prevZ)
            continue;
          px[ps] = nextX;
          py[ps] = nextY;
          pz[ps] = nextZ;
          posStore.markDirty(id);
          onMove?.(ctx, id, { x: prevX, y: prevY, z: prevZ }, { x: nextX, y: nextY, z: nextZ });
        }
        return;
      }

      for (const id of source) {
        const vel = velStore.get(id);
        if (!vel)
          continue;
        const pos = posStore.get(id);
        if (!pos)
          continue;
        const dx = vel.vx * dt;
        const dy = vel.vy * dt;
        const dz = vel.vz * dt;
        if (dx === 0 && dy === 0 && dz === 0)
          continue;

        const prevX = pos.x;
        const prevY = pos.y;
        const prevZ = pos.z;
        let nextX = prevX + dx;
        let nextY = prevY + dy;
        let nextZ = prevZ + dz;
        if (boundary) {
          nextX = applyBoundary(nextX, boundary.bounds.width, boundary.mode);
          nextY = applyBoundary(nextY, boundary.bounds.height, boundary.mode);
          nextZ = applyBoundary(nextZ, boundary.bounds.depth, boundary.mode);
        }
        if (nextX === prevX && nextY === prevY && nextZ === prevZ)
          continue;
        pos.x = nextX;
        pos.y = nextY;
        pos.z = nextZ;
        onMove?.(ctx, id, { x: prevX, y: prevY, z: prevZ }, { x: nextX, y: nextY, z: nextZ });
      }
    },
  };
}
