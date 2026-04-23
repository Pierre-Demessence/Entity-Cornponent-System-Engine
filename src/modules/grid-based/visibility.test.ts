import type { Point, VisibilityGrid } from './visibility';

import { describe, expect, it } from 'vitest';

import {
  bresenhamLine,
  computeFieldOfView,
  hasLineOfSight,

} from './visibility';

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

function makeGrid(width: number, height: number, blocked: Point[] = []): VisibilityGrid {
  const blockedSet = new Set(blocked.map(p => keyOf(p.x, p.y)));
  return {
    blocksSight: (x, y) => blockedSet.has(keyOf(x, y)),
    isInBounds: (x, y) => x >= 0 && x < width && y >= 0 && y < height,
  };
}

function hasPoint(points: Point[], x: number, y: number): boolean {
  return points.some(p => p.x === x && p.y === y);
}

describe('bresenhamLine', () => {
  it('returns a single point for same start and end', () => {
    expect(bresenhamLine(5, 5, 5, 5)).toEqual([{ x: 5, y: 5 }]);
  });

  it('traces horizontal and vertical lines', () => {
    expect(bresenhamLine(0, 0, 3, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(bresenhamLine(0, 0, 0, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
    ]);
  });

  it('traces diagonal lines in both directions', () => {
    expect(bresenhamLine(0, 0, 3, 3)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
    const backward = bresenhamLine(3, 3, 0, 0);
    expect(backward.at(0)).toEqual({ x: 3, y: 3 });
    expect(backward.at(-1)).toEqual({ x: 0, y: 0 });
  });
});

describe('hasLineOfSight', () => {
  it('returns true on an unobstructed line', () => {
    const grid = makeGrid(20, 20);
    expect(hasLineOfSight(grid, 1, 1, 10, 10)).toBe(true);
  });

  it('returns false when an intermediate tile blocks sight', () => {
    const grid = makeGrid(20, 20, [{ x: 5, y: 5 }]);
    expect(hasLineOfSight(grid, 0, 5, 10, 5)).toBe(false);
  });

  it('ignores blocking on origin and destination tiles', () => {
    const grid = makeGrid(20, 20, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(hasLineOfSight(grid, 0, 0, 10, 0)).toBe(true);
  });

  it('fails when an intermediate tile goes out of bounds', () => {
    const grid = makeGrid(4, 4);
    expect(hasLineOfSight(grid, 0, 0, 5, 0)).toBe(false);
  });
});

describe('computeFieldOfView', () => {
  it('returns origin only when radius is zero', () => {
    const grid = makeGrid(20, 20);
    const visible = computeFieldOfView(grid, 5, 5, 0);
    expect(visible).toEqual([{ x: 5, y: 5 }]);
  });

  it('returns empty when radius is negative', () => {
    const grid = makeGrid(20, 20);
    expect(computeFieldOfView(grid, 5, 5, -1)).toEqual([]);
  });

  it('returns empty when origin is out of bounds', () => {
    const grid = makeGrid(20, 20);
    expect(computeFieldOfView(grid, -1, 5, 3)).toEqual([]);
    expect(computeFieldOfView(grid, 5, 20, 3)).toEqual([]);
  });

  it('includes origin and nearby points within radius on open maps', () => {
    const grid = makeGrid(20, 20);
    const visible = computeFieldOfView(grid, 5, 5, 3);

    expect(hasPoint(visible, 5, 5)).toBe(true);
    expect(hasPoint(visible, 8, 5)).toBe(true);
    expect(hasPoint(visible, 5, 8)).toBe(true);
    expect(hasPoint(visible, 9, 5)).toBe(false);
  });

  it('never returns points outside bounds', () => {
    const grid = makeGrid(4, 4);
    const visible = computeFieldOfView(grid, 0, 0, 6);

    for (const p of visible) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(4);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(4);
    }
  });

  it('marks blockers visible but keeps hard-occluded tiles hidden', () => {
    const blocked: Point[] = [];
    for (let y = 0; y < 10; y++)
      blocked.push({ x: 4, y });

    const grid = makeGrid(10, 10, blocked);
    const visible = computeFieldOfView(grid, 2, 5, 8);

    expect(hasPoint(visible, 4, 5)).toBe(true);
    expect(hasPoint(visible, 6, 5)).toBe(false);
  });
});
