import type { EntityId } from '#entity-id';

function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** Grid-based spatial lookup mapping (x,y) positions to sets of entity IDs. */
export class SpatialIndex {
  private cells = new Map<string, Set<EntityId>>();

  add(id: EntityId, x: number, y: number): void {
    const k = key(x, y);
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

  /** Return all entity IDs at a given cell, or `undefined` if no entities are present. */
  getAt(x: number, y: number): ReadonlySet<EntityId> | undefined {
    return this.cells.get(key(x, y));
  }

  /** Collect all entity IDs within an axis-aligned rectangle (inclusive bounds). */
  getInRect(x1: number, y1: number, x2: number, y2: number): EntityId[] {
    const result: EntityId[] = [];
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        const set = this.cells.get(key(x, y));
        if (set) {
          for (const id of set) result.push(id);
        }
      }
    }
    return result;
  }

  /** Update an entity's position, skipping work if the cell hasn't changed. */
  move(id: EntityId, oldX: number, oldY: number, newX: number, newY: number): void {
    const oldK = key(oldX, oldY);
    const newK = key(newX, newY);
    if (oldK === newK)
      return;
    this.remove(id, oldX, oldY);
    this.add(id, newX, newY);
  }

  remove(id: EntityId, x: number, y: number): void {
    const k = key(x, y);
    const set = this.cells.get(k);
    if (!set)
      return;
    set.delete(id);
    if (set.size === 0)
      this.cells.delete(k);
  }
}
