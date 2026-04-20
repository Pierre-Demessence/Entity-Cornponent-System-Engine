import type { EntityId } from '#entity-id';
import type { SpatialStructure } from '#spatial-structure';

import { describe, expect, it } from 'vitest';

interface Pos {
  readonly x: number;
  readonly y: number;
}

/**
 * Trivial brute-force stub — every query walks the full registry. Exists
 * only to verify that a minimal implementation can satisfy the
 * {@link SpatialStructure} contract. Every shipped backend (HashGrid2D,
 * future QuadTree, Octree, …) gets its own targeted test suite.
 */
class StubSpatial implements SpatialStructure<Pos> {
  private entries = new Map<EntityId, Pos>();

  add(id: EntityId, pos: Pos): void {
    this.entries.set(id, { x: pos.x, y: pos.y });
  }

  clear(): void {
    this.entries.clear();
  }

  move(id: EntityId, _from: Pos, to: Pos): void {
    this.entries.set(id, { x: to.x, y: to.y });
  }

  * queryAt(pos: Pos): Iterable<EntityId> {
    for (const [id, p] of this.entries) {
      if (p.x === pos.x && p.y === pos.y)
        yield id;
    }
  }

  * queryNear(pos: Pos, radius: number): Iterable<EntityId> {
    if (radius < 0)
      return;
    const r2 = radius * radius;
    for (const [id, p] of this.entries) {
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      if (dx * dx + dy * dy <= r2)
        yield id;
    }
  }

  * queryRect(min: Pos, max: Pos): Iterable<EntityId> {
    for (const [id, p] of this.entries) {
      if (p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y)
        yield id;
    }
  }

  remove(id: EntityId): void {
    this.entries.delete(id);
  }
}

describe('spatialStructure contract', () => {
  it('queryAt returns an Iterable (not a Set)', () => {
    const s: SpatialStructure<Pos> = new StubSpatial();
    s.add(1, { x: 2, y: 3 });
    const result = s.queryAt({ x: 2, y: 3 });
    // Must be iterable via for..of / spread — the contract.
    expect([...result]).toEqual([1]);
  });

  it('queryAt yields an empty iterable when nothing is at the position', () => {
    const s: SpatialStructure<Pos> = new StubSpatial();
    expect([...s.queryAt({ x: 0, y: 0 })]).toEqual([]);
  });

  it('queryRect yields entities within inclusive AABB bounds', () => {
    const s: SpatialStructure<Pos> = new StubSpatial();
    s.add(1, { x: 0, y: 0 });
    s.add(2, { x: 2, y: 2 });
    s.add(3, { x: 5, y: 5 });
    const result = [...s.queryRect({ x: 0, y: 0 }, { x: 3, y: 3 })].sort();
    expect(result).toEqual([1, 2]);
  });

  it('queryNear yields entities within Euclidean radius', () => {
    const s: SpatialStructure<Pos> = new StubSpatial();
    s.add(1, { x: 0, y: 0 });
    s.add(2, { x: 1, y: 1 }); // distance sqrt(2) ≈ 1.41
    s.add(3, { x: 3, y: 0 }); // distance 3
    const result = [...s.queryNear({ x: 0, y: 0 }, 2)].sort();
    expect(result).toEqual([1, 2]);
  });

  it('move updates position', () => {
    const s: SpatialStructure<Pos> = new StubSpatial();
    s.add(1, { x: 0, y: 0 });
    s.move(1, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect([...s.queryAt({ x: 0, y: 0 })]).toEqual([]);
    expect([...s.queryAt({ x: 5, y: 5 })]).toEqual([1]);
  });

  it('clear removes everything', () => {
    const s: SpatialStructure<Pos> = new StubSpatial();
    s.add(1, { x: 0, y: 0 });
    s.add(2, { x: 1, y: 1 });
    s.clear();
    expect([...s.queryRect({ x: -100, y: -100 }, { x: 100, y: 100 })]).toEqual([]);
  });
});
