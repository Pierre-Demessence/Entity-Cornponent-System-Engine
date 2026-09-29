import type { EntityId } from '#entity-id';
import type { SpatialStructure } from '#spatial-structure';

interface Pos3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** {@link HashGrid3D} construction options. */
export interface HashGrid3DOptions {
  /** Edge length of one cubic cell, in world units. Defaults to `1`. Must be `> 0`. */
  readonly cellSize?: number;
}

/**
 * Spatial hash over continuous `{x, y, z}` positions. Implements
 * {@link SpatialStructure} with `TPos = {x, y, z}`, so it plugs into
 * `world.enableSpatial(Position3DDef, new HashGrid3D({ cellSize }))`.
 *
 * Each position is bucketed into the cubic cell `floor(p / cellSize)` on every
 * axis. The grid keeps a copy of each entity's position, so:
 *
 * - `queryNear` and `queryRect` are exact — Euclidean distance and inclusive
 *   bounds against the stored position, not just "shares a cell";
 * - `remove` and `move` find the entity's current cell from the stored copy.
 *
 * An entity holds one position: `add` on an entity already present moves it.
 * `queryAt(pos)` returns the entities in the cell containing `pos`.
 *
 * Pick `cellSize` near the typical query radius: much smaller and a query
 * walks many empty cells, much larger and each cell holds many candidates.
 * A query whose box spans more cells than the grid holds entities scans the
 * stored positions instead.
 */
export class HashGrid3D implements SpatialStructure<Pos3> {
  private readonly cells = new Map<number, Map<number, Map<number, Set<EntityId>>>>();
  readonly cellSize: number;
  private readonly positions = new Map<EntityId, Pos3>();

  constructor(options: HashGrid3DOptions = {}) {
    const cellSize = options.cellSize ?? 1;
    if (!(cellSize > 0))
      throw new RangeError(`HashGrid3D cellSize must be > 0, got ${cellSize}`);
    this.cellSize = cellSize;
  }

  add(id: EntityId, pos: Pos3): void {
    const prev = this.positions.get(id);
    if (prev !== undefined)
      this.unlink(id, prev);
    const copy = { x: pos.x, y: pos.y, z: pos.z };
    this.positions.set(id, copy);
    this.link(id, copy);
  }

  /** Every id in a cell overlapping the box — a superset the caller filters exactly. */
  private* candidates(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Generator<EntityId> {
    if (minX > maxX || minY > maxY || minZ > maxZ)
      return;
    const x0 = this.cellOf(minX);
    const y0 = this.cellOf(minY);
    const z0 = this.cellOf(minZ);
    const x1 = this.cellOf(maxX);
    const y1 = this.cellOf(maxY);
    const z1 = this.cellOf(maxZ);
    const span = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    if (span > this.positions.size) {
      yield* this.positions.keys();
      return;
    }
    for (let z = z0; z <= z1; z++) {
      const plane = this.cells.get(z);
      if (!plane)
        continue;
      for (let y = y0; y <= y1; y++) {
        const row = plane.get(y);
        if (!row)
          continue;
        for (let x = x0; x <= x1; x++) {
          const cell = row.get(x);
          if (cell)
            yield* cell;
        }
      }
    }
  }

  private cellAt(x: number, y: number, z: number): Set<EntityId> | undefined {
    return this.cells.get(z)?.get(y)?.get(x);
  }

  private cellOf(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  clear(): void {
    this.cells.clear();
    this.positions.clear();
  }

  /** Whether `id` is in the grid. */
  has(id: EntityId): boolean {
    return this.positions.has(id);
  }

  private link(id: EntityId, p: Pos3): void {
    const x = this.cellOf(p.x);
    const y = this.cellOf(p.y);
    const z = this.cellOf(p.z);
    let plane = this.cells.get(z);
    if (!plane) {
      plane = new Map();
      this.cells.set(z, plane);
    }
    let row = plane.get(y);
    if (!row) {
      row = new Map();
      plane.set(y, row);
    }
    let cell = row.get(x);
    if (!cell) {
      cell = new Set();
      row.set(x, cell);
    }
    cell.add(id);
  }

  /** Move `id` to `to`. The stored position, not `from`, locates its current cell. Adds `id` if absent. */
  move(id: EntityId, _from: Pos3, to: Pos3): void {
    this.add(id, to);
  }

  /** The position `id` was last added or moved to, or `undefined` if absent. */
  positionOf(id: EntityId): Pos3 | undefined {
    return this.positions.get(id);
  }

  * queryAt(pos: Pos3): Iterable<EntityId> {
    const cell = this.cellAt(this.cellOf(pos.x), this.cellOf(pos.y), this.cellOf(pos.z));
    if (cell)
      yield* cell;
  }

  * queryNear(pos: Pos3, radius: number): Iterable<EntityId> {
    if (!(radius >= 0))
      return;
    const r2 = radius * radius;
    for (const id of this.candidates(pos.x - radius, pos.y - radius, pos.z - radius, pos.x + radius, pos.y + radius, pos.z + radius)) {
      const p = this.positions.get(id)!;
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      const dz = p.z - pos.z;
      if (dx * dx + dy * dy + dz * dz <= r2)
        yield id;
    }
  }

  * queryRect(min: Pos3, max: Pos3): Iterable<EntityId> {
    for (const id of this.candidates(min.x, min.y, min.z, max.x, max.y, max.z)) {
      const p = this.positions.get(id)!;
      if (p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z)
        yield id;
    }
  }

  /** Remove `id`. The stored position, not `pos`, locates its cell. No-op if absent. */
  remove(id: EntityId, _pos?: Pos3): void {
    const prev = this.positions.get(id);
    if (prev === undefined)
      return;
    this.unlink(id, prev);
    this.positions.delete(id);
  }

  /** Number of entities in the grid. */
  get size(): number {
    return this.positions.size;
  }

  private unlink(id: EntityId, p: Pos3): void {
    const x = this.cellOf(p.x);
    const y = this.cellOf(p.y);
    const z = this.cellOf(p.z);
    const plane = this.cells.get(z);
    const row = plane?.get(y);
    const cell = row?.get(x);
    if (!cell)
      return;
    cell.delete(id);
    if (cell.size > 0)
      return;
    row!.delete(x);
    if (row!.size > 0)
      return;
    plane!.delete(y);
    if (plane!.size === 0)
      this.cells.delete(z);
  }
}
