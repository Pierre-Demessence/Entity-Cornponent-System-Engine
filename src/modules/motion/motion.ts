import type { EntityId, SchedulableSystem } from '#index';

import type { Position } from '../transform/position';

import { PositionDef } from '../transform/position';
import { VelocityDef } from '../transform/velocity';

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

export interface VelocityIntegrationTickCtx {
  /** Elapsed time since the previous tick, in milliseconds. */
  dtMs: number;
  world: import('#index').EcsWorld;
}

export interface VelocityIntegrationOptions<TCtx extends VelocityIntegrationTickCtx> {
  name?: string;
  boundary?: VelocityIntegrationBoundary;
  runAfter?: string[];
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

export function makeVelocityIntegrationSystem<TCtx extends VelocityIntegrationTickCtx>(
  options: VelocityIntegrationOptions<TCtx> = {},
): SchedulableSystem<TCtx> {
  const { name = 'motion', boundary, onMove, runAfter } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const dt = ctx.dtMs / 1000;
      if (dt === 0)
        return;
      const posStore = ctx.world.getStore(PositionDef);
      const velStore = ctx.world.getStore(VelocityDef);

      for (const id of velStore.keys()) {
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
