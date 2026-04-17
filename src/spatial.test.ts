import { describe, expect, it } from 'vitest';

import { SpatialIndex } from './spatial';

describe('spatialIndex', () => {
  it('add and getAt', () => {
    const s = new SpatialIndex();
    s.add(1, 3, 5);
    const at = s.getAt(3, 5);
    expect(at).toBeDefined();
    expect(at!.has(1)).toBe(true);
  });

  it('returns undefined for empty cells', () => {
    const s = new SpatialIndex();
    expect(s.getAt(0, 0)).toBeUndefined();
  });

  it('multiple entities at same cell', () => {
    const s = new SpatialIndex();
    s.add(1, 0, 0);
    s.add(2, 0, 0);
    const at = s.getAt(0, 0)!;
    expect(at.size).toBe(2);
    expect(at.has(1)).toBe(true);
    expect(at.has(2)).toBe(true);
  });

  describe('remove', () => {
    it('removes entity from cell', () => {
      const s = new SpatialIndex();
      s.add(1, 3, 5);
      s.remove(1, 3, 5);
      expect(s.getAt(3, 5)).toBeUndefined();
    });

    it('cleans up empty cells', () => {
      const s = new SpatialIndex();
      s.add(1, 0, 0);
      s.remove(1, 0, 0);
      expect(s.getAt(0, 0)).toBeUndefined();
    });

    it('does nothing for non-existent cell', () => {
      const s = new SpatialIndex();
      s.remove(1, 99, 99);
      expect(s.getAt(99, 99)).toBeUndefined();
    });
  });

  describe('move', () => {
    it('moves entity between cells', () => {
      const s = new SpatialIndex();
      s.add(1, 0, 0);
      s.move(1, 0, 0, 3, 5);
      expect(s.getAt(0, 0)).toBeUndefined();
      expect(s.getAt(3, 5)!.has(1)).toBe(true);
    });

    it('skips when source and destination are the same cell', () => {
      const s = new SpatialIndex();
      s.add(1, 2, 3);
      s.move(1, 2, 3, 2, 3);
      expect(s.getAt(2, 3)!.has(1)).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      const s = new SpatialIndex();
      s.add(1, 0, 0);
      s.add(2, 5, 5);
      s.clear();
      expect(s.getAt(0, 0)).toBeUndefined();
      expect(s.getAt(5, 5)).toBeUndefined();
    });
  });

  describe('getInRect', () => {
    it('returns entities within bounds', () => {
      const s = new SpatialIndex();
      s.add(1, 0, 0);
      s.add(2, 2, 2);
      s.add(3, 5, 5);
      const result = s.getInRect(0, 0, 3, 3);
      expect(result).toContain(1);
      expect(result).toContain(2);
      expect(result).not.toContain(3);
    });

    it('returns empty array for empty region', () => {
      const s = new SpatialIndex();
      expect(s.getInRect(0, 0, 10, 10)).toEqual([]);
    });

    it('includes entities on bounds', () => {
      const s = new SpatialIndex();
      s.add(1, 0, 0);
      s.add(2, 3, 3);
      const result = s.getInRect(0, 0, 3, 3);
      expect(result).toContain(1);
      expect(result).toContain(2);
    });
  });
});
