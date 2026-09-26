import type { EntityId, SchedulableSystem, TagDef } from '#index';
import type { Position } from '../transform/position';

import { ColumnStore } from '#column-store';

import { PositionDef } from '../transform/position';
import { VelocityDef } from '../transform/velocity';

/** A rectangular play-field size (`width` / `height`) for boundary wrap/clamp. */
export interface Bounds { height: number; width: number }

/**
 * Boundary behavior when a moving entity's position leaves `[0, width) x
 * [0, height)` after integration. `wrap` is the toroidal topology used by
 * classic arcade games (Asteroids); `clamp` pins the coordinate to the
 * edge and is useful when a game wants its world to be physically bounded
 * without additional collider setup.
 */
export type VelocityIntegrationBoundary
  = | { mode: 'wrap'; bounds: Bounds }
    | { mode: 'clamp'; bounds: Bounds };

/** The tick-context fields {@link makeVelocityIntegrationSystem} reads: `world` and `dtMs`. */
export interface VelocityIntegrationTickCtx {
  /** Elapsed time since the previous tick, in milliseconds. */
  dtMs: number;
  world: import('#index').EcsWorld;
}

/** Options for {@link makeVelocityIntegrationSystem}: `name`, an optional `boundary`, `tag`-scoping, and `onMove` / `runAfter` hooks. */
export interface VelocityIntegrationOptions<TCtx extends VelocityIntegrationTickCtx> {
  name?: string;
  boundary?: VelocityIntegrationBoundary;
  runAfter?: string[];
  /**
   * Integrate only entities carrying this tag (in addition to having
   * `Position` + `Velocity`). Unset integrates every velocity entity. The
   * marker/query-filter idiom — Bevy `With<T>`, and this engine's own
   * `kinematics` `dynamicTag` — so a game that runs `kinematics` over its bodies
   * can still integrate a disjoint set without double-integrating them.
   */
  tag?: TagDef;
  /**
   * Invoked once per entity whose position actually changed this tick,
   * after any boundary handling. The `prev` snapshot is a plain value
   * object, not the store entry itself, so it is safe to retain. Provides
   * an escape hatch for games that keep a separate spatial index or
   * dirty-flag queue in sync; the motion module itself does not touch
   * either.
   */
  onMove?: (
    ctx: TCtx,
    id: EntityId,
    prev: Readonly<Position>,
    next: Readonly<Position>,
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
 * A `SchedulableSystem` that advances each entity's `Position` by its
 * `Velocity` scaled by the tick's `dt`, with optional boundary `wrap`/`clamp`,
 * `tag`-scoping to a subset, and an `onMove` hook. Uses a columnar fast path
 * when both stores are Structure-of-Arrays.
 */
export function makeVelocityIntegrationSystem<TCtx extends VelocityIntegrationTickCtx>(
  options: VelocityIntegrationOptions<TCtx> = {},
): SchedulableSystem<TCtx> {
  const { name = 'motion', boundary, onMove, runAfter, tag } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const dt = ctx.dtMs / 1000;
      if (dt === 0)
        return;
      const posStore = ctx.world.getStore(PositionDef);
      const velStore = ctx.world.getStore(VelocityDef);
      // Marker-scoped when `tag` is set (iterate that subset), else every
      // velocity entity — matching `kinematics`'s `dynamicTag` iteration.
      const source: Iterable<EntityId> = tag ? ctx.world.getTag(tag) : velStore.keys();

      // Columnar fast path: when both stores are Structure-of-Arrays, integrate
      // directly over the typed-array columns — no per-entity view allocation.
      // Behaviour matches the object path exactly (boundary, skip-if-still,
      // onMove); direct column writes mark the entity dirty like the view setter.
      // Column refs are captured once, so `onMove` must not add new Position/
      // Velocity entities (that would grow() and reallocate the columns) — the
      // same constraint the slow path already has on the velStore.keys() iterator.
      if (posStore instanceof ColumnStore && velStore instanceof ColumnStore) {
        const px = posStore.column('x');
        const py = posStore.column('y');
        const vx = velStore.column('vx');
        const vy = velStore.column('vy');
        for (const id of source) {
          const vs = velStore.slotOf(id);
          if (vs === undefined)
            continue;
          const dx = vx[vs] * dt;
          const dy = vy[vs] * dt;
          if (dx === 0 && dy === 0)
            continue;
          const ps = posStore.slotOf(id);
          if (ps === undefined)
            continue;
          const prevX = px[ps];
          const prevY = py[ps];
          let nextX = prevX + dx;
          let nextY = prevY + dy;
          if (boundary) {
            nextX = applyBoundary(nextX, boundary.bounds.width, boundary.mode);
            nextY = applyBoundary(nextY, boundary.bounds.height, boundary.mode);
          }
          if (nextX === prevX && nextY === prevY)
            continue;
          px[ps] = nextX;
          py[ps] = nextY;
          posStore.markDirty(id);
          onMove?.(ctx, id, { x: prevX, y: prevY }, { x: nextX, y: nextY });
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
        if (dx === 0 && dy === 0)
          continue;

        const prevX = pos.x;
        const prevY = pos.y;
        let nextX = prevX + dx;
        let nextY = prevY + dy;
        if (boundary) {
          nextX = applyBoundary(nextX, boundary.bounds.width, boundary.mode);
          nextY = applyBoundary(nextY, boundary.bounds.height, boundary.mode);
        }
        if (nextX === prevX && nextY === prevY)
          continue;
        pos.x = nextX;
        pos.y = nextY;
        onMove?.(ctx, id, { x: prevX, y: prevY }, { x: nextX, y: nextY });
      }
    },
  };
}
