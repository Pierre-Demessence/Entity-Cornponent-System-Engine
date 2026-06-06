import type { EntityId } from '#entity-id';

import { HashGrid2D } from './hash-grid-2d';
import { cellOfPoint } from './projections';

/**
 * A {@link HashGrid2D} wrapper that accepts **continuous** `{x, y}`
 * world-space positions and projects them to integer cell keys internally
 * via `Math.floor(pos / cellSize)`.
 *
 * Useful when entity positions are in pixel or world-unit coordinates
 * rather than pre-quantised grid indices.  Three consumers (asteroids,
 * platformer, top-down-shooter) all hand-rolled this projection before
 * this class shipped.
 *
 * Exposes the underlying {@link HashGrid2D} as `.grid` for consumers
 * that need the integer-cell API directly (e.g. spatial queries in
 * collision broadphase).
 */
export class ContinuousHashGrid2D {
  readonly cellSize: number;
  /** The underlying integer-cell grid. */
  readonly grid = new HashGrid2D();

  constructor(cellSize: number) {
    if (cellSize <= 0)
      throw new RangeError(`cellSize must be > 0, got ${cellSize}`);
    this.cellSize = cellSize;
  }

  // -- Continuous-position index methods -------------------------------

  add(id: EntityId, x: number, y: number): void {
    const c = cellOfPoint(x, y, this.cellSize);
    this.grid.add(id, c.x, c.y);
  }

  clear(): void {
    this.grid.clear();
  }

  /** All matching entities in the cell containing `(x, y)`. */
  findAt(x: number, y: number, predicate: (id: EntityId) => boolean): EntityId[] {
    const c = cellOfPoint(x, y, this.cellSize);
    return this.grid.findAt(c.x, c.y, predicate);
  }

  /** First matching entity in the cell containing `(x, y)`, or `undefined`. */
  findFirstAt(x: number, y: number, predicate: (id: EntityId) => boolean): EntityId | undefined {
    const c = cellOfPoint(x, y, this.cellSize);
    return this.grid.findFirstAt(c.x, c.y, predicate);
  }

  // -- Query methods ----------------------------------------------------

  /** All entities in the cell containing `(x, y)`, or `undefined` if empty. */
  getAt(x: number, y: number): ReadonlySet<EntityId> | undefined {
    const c = cellOfPoint(x, y, this.cellSize);
    return this.grid.getAt(c.x, c.y);
  }

  /**
   * All entity IDs within the continuous rectangle `[x1, x2] × [y1, y2]`
   * (inclusive bounds), returned as an array.
   */
  getInRect(x1: number, y1: number, x2: number, y2: number): EntityId[] {
    const c0 = cellOfPoint(x1, y1, this.cellSize);
    const c1 = cellOfPoint(x2, y2, this.cellSize);
    return this.grid.getInRect(c0.x, c0.y, c1.x, c1.y);
  }

  /**
   * Move an entity from one continuous position to another.  Skips
   * work when the old and new positions fall in the same cell.
   */
  move(id: EntityId, fromX: number, fromY: number, toX: number, toY: number): void {
    const oldC = cellOfPoint(fromX, fromY, this.cellSize);
    const newC = cellOfPoint(toX, toY, this.cellSize);
    this.grid.move(id, oldC.x, oldC.y, newC.x, newC.y);
  }

  // -- Grid-specific extras (delegated to HashGrid2D) -------------------

  /** Iterate every entity in the cell containing `(x, y)`. */
  * queryAt(x: number, y: number): Iterable<EntityId> {
    const c = cellOfPoint(x, y, this.cellSize);
    yield* this.grid.queryAt(c);
  }

  /**
   * Iterate every entity within `radius` world units of `(x, y)`.
   * The radius is converted to cells via `Math.ceil(radius / cellSize)`
   * so the search conservatively covers the whole disc.
   */
  * queryNear(x: number, y: number, radius: number): Iterable<EntityId> {
    const c = cellOfPoint(x, y, this.cellSize);
    const cellRadius = Math.ceil(radius / this.cellSize);
    yield* this.grid.queryNear(c, cellRadius);
  }

  /**
   * Iterate every entity whose cell falls within the continuous
   * axis-aligned rectangle `[minX, maxX] × [minY, maxY]`.
   */
  * queryRect(minX: number, minY: number, maxX: number, maxY: number): Iterable<EntityId> {
    const c0 = cellOfPoint(minX, minY, this.cellSize);
    const c1 = cellOfPoint(maxX, maxY, this.cellSize);
    yield* this.grid.queryRect(c0, c1);
  }

  remove(id: EntityId, x: number, y: number): void {
    const c = cellOfPoint(x, y, this.cellSize);
    this.grid.remove(id, c.x, c.y);
  }
}
