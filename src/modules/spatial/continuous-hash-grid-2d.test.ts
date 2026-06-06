import { describe, expect, it } from 'vitest';

import { ContinuousHashGrid2D } from './continuous-hash-grid-2d';

describe('continuousHashGrid2D', () => {
  const CELL = 10;

  it('rejects non-positive cellSize', () => {
    expect(() => new ContinuousHashGrid2D(0)).toThrow(RangeError);
    expect(() => new ContinuousHashGrid2D(-5)).toThrow(RangeError);
  });

  it('adds and retrieves at continuous positions', () => {
    const g = new ContinuousHashGrid2D(CELL);
    g.add(1, 15, 29); // cell (1, 2)
    expect(g.getAt(15, 29)?.has(1)).toBe(true);
    expect(g.getAt(10, 20)?.has(1)).toBe(true); // same cell
    expect(g.getAt(5, 5)).toBeUndefined();
  });

  it('handles negative coordinates (cells go negative)', () => {
    const g = new ContinuousHashGrid2D(CELL);
    g.add(1, -5, -12); // cell (-1, -2)
    expect(g.getAt(-5, -12)?.has(1)).toBe(true);
    expect(g.getAt(-1, -11)?.has(1)).toBe(true);
    expect(g.getAt(5, 5)).toBeUndefined();
  });

  it('removes entities by continuous position', () => {
    const g = new ContinuousHashGrid2D(CELL);
    g.add(1, 15, 25);
    g.remove(1, 15, 25);
    expect(g.getAt(15, 25)).toBeUndefined();
  });

  it('clears all cells', () => {
    const g = new ContinuousHashGrid2D(CELL);
    g.add(1, 5, 5);
    g.add(2, 50, 60);
    g.clear();
    expect(g.getAt(5, 5)).toBeUndefined();
    expect(g.getAt(50, 60)).toBeUndefined();
  });

  describe('move', () => {
    it('moves entity between cells', () => {
      const g = new ContinuousHashGrid2D(CELL);
      g.add(1, 5, 5); // cell (0, 0)
      g.move(1, 5, 5, 25, 35); // to cell (2, 3)
      expect(g.getAt(5, 5)).toBeUndefined();
      expect(g.getAt(25, 35)?.has(1)).toBe(true);
    });

    it('skips work when same cell', () => {
      const g = new ContinuousHashGrid2D(CELL);
      g.add(1, 5, 5); // cell (0, 0)
      g.move(1, 5, 5, 9, 9); // still cell (0, 0)
      expect(g.getAt(9, 9)?.has(1)).toBe(true);
    });
  });

  describe('queryAt', () => {
    it('yields entities at a continuous position', () => {
      const g = new ContinuousHashGrid2D(CELL);
      g.add(1, 12, 23);
      const ids = [...g.queryAt(12, 23)];
      expect(ids).toEqual([1]);
    });

    it('yields nothing for empty cells', () => {
      const g = new ContinuousHashGrid2D(CELL);
      expect([...g.queryAt(99, 99)]).toEqual([]);
    });
  });

  describe('queryRect', () => {
    it('yields entities within a continuous rectangle', () => {
      const g = new ContinuousHashGrid2D(CELL);
      g.add(1, 5, 5); // cell (0, 0)
      g.add(2, 55, 55); // cell (5, 5)
      g.add(3, 95, 95); // cell (9, 9)
      const ids = [...g.queryRect(0, 0, 60, 60)];
      expect(ids).toContain(1);
      expect(ids).toContain(2);
      expect(ids).not.toContain(3);
    });
  });

  describe('queryNear', () => {
    it('yields entities within radius world units', () => {
      const g = new ContinuousHashGrid2D(CELL);
      g.add(1, 5, 5); // cell (0,0), dist from (50,50) ≈ 63.6
      g.add(2, 45, 45); // cell (4,4), dist from (50,50) ≈ 7.1
      const ids = [...g.queryNear(50, 50, 20)];
      expect(ids).toContain(2);
      expect(ids).not.toContain(1);
    });
  });

  describe('findAt', () => {
    it('filters by predicate', () => {
      const g = new ContinuousHashGrid2D(CELL);
      g.add(1, 15, 25);
      g.add(2, 15, 25);
      const odds = g.findAt(15, 25, id => id % 2 === 1);
      expect(odds).toEqual([1]);
    });
  });

  describe('findFirstAt', () => {
    it('returns first match', () => {
      const g = new ContinuousHashGrid2D(CELL);
      g.add(1, 15, 25);
      g.add(2, 15, 25);
      expect(g.findFirstAt(15, 25, id => id > 0)).toBe(1);
    });
  });

  describe('getInRect', () => {
    it('collects entities in a continuous rect as array', () => {
      const g = new ContinuousHashGrid2D(CELL);
      g.add(1, 5, 5);
      g.add(2, 55, 55);
      g.add(3, 95, 95);
      expect(g.getInRect(0, 0, 10, 10)).toEqual([1]);
    });
  });
});
