import type { EntityId } from '#entity-id';

import type { HashGrid2D } from './hash-grid-2d';

import { cellOfPoint } from './projections';

interface Pos {
  readonly x: number;
  readonly y: number;
}

export interface GridSyncOnMoveOptions {
  /** Projection size in world units per cell. */
  readonly cellSize: number;
  /** Grid to keep in sync with entity positions. */
  readonly grid: HashGrid2D;
}

/**
 * Shape matches `VelocityIntegrationOptions<TCtx>['onMove']` exactly so
 * the returned callback plugs straight into a velocity integration
 * system. Generic in ctx because the callback ignores it. `Pos` is the
 * local structural equivalent of motion's `Readonly<Position>` — kept
 * private here so `spatial` does not import from `transform`.
 */
export type GridSyncOnMove = <TCtx>(
  ctx: TCtx,
  id: EntityId,
  prev: Pos,
  next: Pos,
) => void;

/**
 * Build an `onMove` callback that keeps a {@link HashGrid2D} in sync
 * with per-entity position changes produced by
 * `makeVelocityIntegrationSystem`. Projects both snapshots through
 * {@link cellOfPoint} and calls `grid.move(id, from, to)` only when
 * the cells differ — a no-op short-circuit matching what consumers
 * used to write by hand.
 *
 * Consumers remain responsible for initial `grid.add` on spawn and
 * final `grid.remove` on despawn; this helper only covers the motion
 * step.
 */
export function makeGridSyncOnMove(
  options: GridSyncOnMoveOptions,
): GridSyncOnMove {
  const { cellSize, grid } = options;
  return (_ctx, id, prev, next) => {
    const p = cellOfPoint(prev.x, prev.y, cellSize);
    const n = cellOfPoint(next.x, next.y, cellSize);
    if (p.x === n.x && p.y === n.y)
      return;
    grid.move(id, p, n);
  };
}
