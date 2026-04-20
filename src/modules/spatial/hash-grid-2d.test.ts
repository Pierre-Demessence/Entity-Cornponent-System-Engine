import { describe, expect, it } from 'vitest';

import { HashGrid2D } from './hash-grid-2d';

describe('hashGrid2D', () => {
  it('add and getAt', () => {
    const s = new HashGrid2D();
    s.add(1, 3, 5);
    const at = s.getAt(3, 5);
    expect(at).toBeDefined();
    expect(at!.has(1)).toBe(true);
  });

  it('returns undefined for empty cells', () => {
    const s = new HashGrid2D();
    expect(s.getAt(0, 0)).toBeUndefined();
  });

  it('multiple entities at same cell', () => {
    const s = new HashGrid2D();
    s.add(1, 0, 0);
    s.add(2, 0, 0);
    const at = s.getAt(0, 0)!;
    expect(at.size).toBe(2);
    expect(at.has(1)).toBe(true);
    expect(at.has(2)).toBe(true);
  });

  describe('remove', () => {
    it('removes entity from cell', () => {
      const s = new HashGrid2D();
      s.add(1, 3, 5);
      s.remove(1, 3, 5);
      expect(s.getAt(3, 5)).toBeUndefined();
    });

    it('cleans up empty cells', () => {
      const s = new HashGrid2D();
      s.add(1, 0, 0);
      s.remove(1, 0, 0);
      expect(s.getAt(0, 0)).toBeUndefined();
    });

    it('does nothing for non-existent cell', () => {
      const s = new HashGrid2D();
      s.remove(1, 99, 99);
      expect(s.getAt(99, 99)).toBeUndefined();
    });
  });

  describe('move', () => {
    it('moves entity between cells (integer shorthand)', () => {
      const s = new HashGrid2D();
      s.add(1, 0, 0);
      s.move(1, 0, 0, 3, 5);
      expect(s.getAt(0, 0)).toBeUndefined();
      expect(s.getAt(3, 5)!.has(1)).toBe(true);
    });

    it('moves entity between cells (Pos shape, interface API)', () => {
      const s = new HashGrid2D();
      s.add(1, { x: 0, y: 0 });
      s.move(1, { x: 0, y: 0 }, { x: 3, y: 5 });
      expect(s.getAt(0, 0)).toBeUndefined();
      expect(s.getAt(3, 5)!.has(1)).toBe(true);
    });

    it('skips when source and destination are the same cell', () => {
      const s = new HashGrid2D();
      s.add(1, 2, 3);
      s.move(1, 2, 3, 2, 3);
      expect(s.getAt(2, 3)!.has(1)).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const s = new HashGrid2D();
      s.add(1, 0, 0);
      s.add(2, 5, 5);
      s.clear();
      expect(s.getAt(0, 0)).toBeUndefined();
      expect(s.getAt(5, 5)).toBeUndefined();
    });
  });

  describe('getInRect / queryRect', () => {
    it('getInRect returns entities within bounds', () => {
      const s = new HashGrid2D();
      s.add(1, 0, 0);
      s.add(2, 2, 2);
      s.add(3, 5, 5);
      const result = s.getInRect(0, 0, 3, 3);
      expect(result).toContain(1);
      expect(result).toContain(2);
      expect(result).not.toContain(3);
    });

    it('getInRect returns empty array for empty region', () => {
      const s = new HashGrid2D();
      expect(s.getInRect(0, 0, 10, 10)).toEqual([]);
    });

    it('getInRect includes entities on bounds', () => {
      const s = new HashGrid2D();
      s.add(1, 0, 0);
      s.add(2, 3, 3);
      const result = s.getInRect(0, 0, 3, 3);
      expect(result).toContain(1);
      expect(result).toContain(2);
    });

    it('queryRect yields same entities as getInRect (Iterable interface)', () => {
      const s = new HashGrid2D();
      s.add(1, 0, 0);
      s.add(2, 2, 2);
      s.add(3, 5, 5);
      const result = [...s.queryRect({ x: 0, y: 0 }, { x: 3, y: 3 })];
      expect(result).toContain(1);
      expect(result).toContain(2);
      expect(result).not.toContain(3);
    });

    it('queryRect yields an empty iterable for an empty region', () => {
      const s = new HashGrid2D();
      expect([...s.queryRect({ x: 0, y: 0 }, { x: 10, y: 10 })]).toEqual([]);
    });
  });

  describe('queryAt', () => {
    it('yields all entities at a position', () => {
      const s = new HashGrid2D();
      s.add(1, 5, 5);
      s.add(2, 5, 5);
      const result = [...s.queryAt({ x: 5, y: 5 })];
      expect(result.sort()).toEqual([1, 2]);
    });

    it('yields an empty iterable when the cell is empty', () => {
      const s = new HashGrid2D();
      expect([...s.queryAt({ x: 0, y: 0 })]).toEqual([]);
    });
  });

  describe('queryNear', () => {
    it('yields entities within the given radius (Euclidean)', () => {
      const s = new HashGrid2D();
      s.add(1, 0, 0);
      s.add(2, 2, 0); // distance 2
      s.add(3, 3, 0); // distance 3 — out at radius 2
      s.add(4, 1, 1); // distance sqrt(2) ≈ 1.41
      const result = [...s.queryNear({ x: 0, y: 0 }, 2)].sort();
      expect(result).toEqual([1, 2, 4]);
    });

    it('yields an empty iterable when nothing is nearby', () => {
      const s = new HashGrid2D();
      s.add(1, 10, 10);
      expect([...s.queryNear({ x: 0, y: 0 }, 3)]).toEqual([]);
    });

    it('includes the point itself when radius >= 0', () => {
      const s = new HashGrid2D();
      s.add(1, 5, 5);
      const result = [...s.queryNear({ x: 5, y: 5 }, 0)];
      expect(result).toEqual([1]);
    });

    it('yields nothing for negative radius', () => {
      const s = new HashGrid2D();
      s.add(1, 0, 0);
      expect([...s.queryNear({ x: 0, y: 0 }, -1)]).toEqual([]);
    });

    it('handles non-integer radius by rounding up cell iteration', () => {
      const s = new HashGrid2D();
      s.add(1, 1, 1); // distance sqrt(2) ≈ 1.414
      const inside = [...s.queryNear({ x: 0, y: 0 }, 1.5)];
      const outside = [...s.queryNear({ x: 0, y: 0 }, 1.4)];
      expect(inside).toEqual([1]);
      expect(outside).toEqual([]);
    });
  });

  describe('findAt / findFirstAt', () => {
    it('findAt returns every entity matching the predicate', () => {
      const s = new HashGrid2D();
      s.add(1, 5, 5);
      s.add(2, 5, 5);
      s.add(3, 5, 5);
      const result = s.findAt(5, 5, id => id % 2 === 1);
      expect(result.sort()).toEqual([1, 3]);
    });

    it('findAt returns an empty array when the cell is empty', () => {
      const s = new HashGrid2D();
      expect(s.findAt(0, 0, () => true)).toEqual([]);
    });

    it('findAt returns an empty array when nothing matches', () => {
      const s = new HashGrid2D();
      s.add(1, 5, 5);
      expect(s.findAt(5, 5, () => false)).toEqual([]);
    });

    it('findFirstAt returns the first matching entity', () => {
      const s = new HashGrid2D();
      s.add(1, 5, 5);
      s.add(2, 5, 5);
      const result = s.findFirstAt(5, 5, id => id === 2);
      expect(result).toBe(2);
    });

    it('findFirstAt returns undefined when nothing matches', () => {
      const s = new HashGrid2D();
      s.add(1, 5, 5);
      expect(s.findFirstAt(5, 5, () => false)).toBeUndefined();
    });

    it('findFirstAt returns undefined for an empty cell', () => {
      const s = new HashGrid2D();
      expect(s.findFirstAt(0, 0, () => true)).toBeUndefined();
    });
  });
});
