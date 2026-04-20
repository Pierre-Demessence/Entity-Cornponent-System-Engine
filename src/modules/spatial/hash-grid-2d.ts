import type { EntityId } from '#entity-id';
import type { SpatialStructure } from '#spatial-structure';

interface Pos {
  readonly x: number;
  readonly y: number;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Grid-based spatial index mapping integer `(x, y)` cells to sets of
 * entity IDs. Implements {@link SpatialStructure} with `TPos = {x, y}`.
 *
 * Suitable for grid games (roguelikes, chess, tile strategy) and for
 * continuous-position games when paired with `Math.floor(pos / cellSize)`
 * cell hashing done by the caller.
 *
 * Exposes the interface methods (`queryAt`/`queryRect`/`queryNear`/etc.)
 * plus grid-specific extras (`getAt`, `findAt`, `findFirstAt`, `getInRect`,
 * integer `add(id, x, y)` overloads) that exploit the backing `Map<string, Set>`.
 * The extras are honest about the structure — they aren't part of the
 * {@link SpatialStructure} contract.
 */
export class HashGrid2D implements SpatialStructure<Pos> {
  private cells = new Map<string, Set<EntityId>>();

  // -- SpatialStructure<Pos> interface ------------------------------------

  add(id: EntityId, posOrX: Pos | number, y?: number): void {
    const [x, yy] = typeof posOrX === 'number' ? [posOrX, y!] : [posOrX.x, posOrX.y];
    const k = key(x, yy);
    let set = this.cells.get(k);
    if (!set) {
      set = new Set();
      this.cells.set(k, set);
    }
    set.add(id);
  }

  clear(): void {
    this.cells.clear();
  }

  /**
   * Collect every entity at `(x, y)` for which `predicate(id)` returns true.
   * Returns an empty array when the cell is empty or no entity matches. The
   * predicate is application-defined — typical uses are "is a blocker", "is
   * an item", "is pickable up" — and carries the game-specific semantics,
   * keeping the spatial index itself domain-neutral.
   */
  findAt(x: number, y: number, predicate: (id: EntityId) => boolean): EntityId[] {
    const cell = this.cells.get(key(x, y));
    if (!cell)
      return [];
    const result: EntityId[] = [];
    for (const id of cell) {
      if (predicate(id))
        result.push(id);
    }
    return result;
  }

  /**
   * Return the first entity at `(x, y)` for which `predicate(id)` returns
   * true, or `undefined` if none match. Iteration order follows the
   * underlying `Set` insertion order; callers needing a deterministic
   * preference should use `findAt` and sort the result.
   */
  findFirstAt(x: number, y: number, predicate: (id: EntityId) => boolean): EntityId | undefined {
    const cell = this.cells.get(key(x, y));
    if (!cell)
      return undefined;
    for (const id of cell) {
      if (predicate(id))
        return id;
    }
    return undefined;
  }

  /**
   * Return all entity IDs at a given cell, or `undefined` if no entities
   * are present. Exposes the backing `Set` directly for zero-alloc
   * `.has()` / `.size` checks — a grid-specific escape hatch. Prefer
   * {@link queryAt} when writing backend-agnostic code.
   */
  getAt(x: number, y: number): ReadonlySet<EntityId> | undefined {
    return this.cells.get(key(x, y));
  }

  /** Collect all entity IDs within an axis-aligned rectangle (inclusive bounds) as an array. */
  getInRect(x1: number, y1: number, x2: number, y2: number): EntityId[] {
    return [...this.queryRect({ x: x1, y: y1 }, { x: x2, y: y2 })];
  }

  /**
   * Update an entity's position. Accepts either the interface shape
   * `move(id, from, to)` or the grid shorthand `move(id, ox, oy, nx, ny)`.
   * Skips work if the cell hasn't changed.
   */
  move(id: EntityId, fromOrOldX: Pos | number, toOrOldY: Pos | number, newX?: number, newY?: number): void {
    let oldX: number, oldY: number, newXX: number, newYY: number;
    if (typeof fromOrOldX === 'number') {
      oldX = fromOrOldX;
      oldY = toOrOldY as number;
      newXX = newX!;
      newYY = newY!;
    }
    else {
      oldX = fromOrOldX.x;
      oldY = fromOrOldX.y;
      newXX = (toOrOldY as Pos).x;
      newYY = (toOrOldY as Pos).y;
    }
    const oldK = key(oldX, oldY);
    const newK = key(newXX, newYY);
    if (oldK === newK)
      return;
    this.remove(id, oldX, oldY);
    this.add(id, newXX, newYY);
  }

  // -- Grid-specific ergonomics (NOT part of SpatialStructure) -----------

  * queryAt(pos: Pos): Iterable<EntityId> {
    const cell = this.cells.get(key(pos.x, pos.y));
    if (!cell)
      return;
    for (const id of cell) yield id;
  }

  * queryNear(pos: Pos, radius: number): Iterable<EntityId> {
    if (radius < 0)
      return;
    const r = Math.ceil(radius);
    const r2 = radius * radius;
    for (let y = pos.y - r; y <= pos.y + r; y++) {
      for (let x = pos.x - r; x <= pos.x + r; x++) {
        const dx = x - pos.x;
        const dy = y - pos.y;
        if (dx * dx + dy * dy > r2)
          continue;
        const set = this.cells.get(key(x, y));
        if (!set)
          continue;
        for (const id of set) yield id;
      }
    }
  }

  * queryRect(min: Pos, max: Pos): Iterable<EntityId> {
    for (let y = min.y; y <= max.y; y++) {
      for (let x = min.x; x <= max.x; x++) {
        const set = this.cells.get(key(x, y));
        if (!set)
          continue;
        for (const id of set) yield id;
      }
    }
  }

  remove(id: EntityId, posOrX: Pos | number, y?: number): void {
    const [x, yy] = typeof posOrX === 'number' ? [posOrX, y!] : [posOrX.x, posOrX.y];
    const k = key(x, yy);
    const set = this.cells.get(k);
    if (!set)
      return;
    set.delete(id);
    if (set.size === 0)
      this.cells.delete(k);
  }
}
