import { describe, expect, it } from 'vitest';

import { cellOfPoint, cellsForAabb, cellsForCircle } from './projections';

describe('cellOfPoint', () => {
  it('projects origin to (0,0)', () => {
    expect(cellOfPoint(0, 0, 10)).toEqual({ x: 0, y: 0 });
  });

  it('floors positive coordinates', () => {
    expect(cellOfPoint(15, 29, 10)).toEqual({ x: 1, y: 2 });
    expect(cellOfPoint(9.99, 9.99, 10)).toEqual({ x: 0, y: 0 });
  });

  it('floors negative coordinates (not truncates toward zero)', () => {
    expect(cellOfPoint(-1, -1, 10)).toEqual({ x: -1, y: -1 });
    expect(cellOfPoint(-10, -10, 10)).toEqual({ x: -1, y: -1 });
    expect(cellOfPoint(-10.01, -10.01, 10)).toEqual({ x: -2, y: -2 });
  });

  it('respects cellSize', () => {
    expect(cellOfPoint(64, 64, 64)).toEqual({ x: 1, y: 1 });
    expect(cellOfPoint(63, 63, 64)).toEqual({ x: 0, y: 0 });
  });
});

describe('cellsForAabb', () => {
  it('yields a single cell for a box fully inside one cell', () => {
    expect([...cellsForAabb(1, 1, 2, 2, 10)]).toEqual([{ x: 0, y: 0 }]);
  });

  it('yields all cells of a 2x2 span', () => {
    const cells = [...cellsForAabb(5, 5, 10, 10, 10)];
    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  it('handles boxes that straddle the origin into negative cells', () => {
    const cells = [...cellsForAabb(-5, -5, 10, 10, 10)];
    expect(cells).toEqual([
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('yields nothing? — no, always yields at least the corner cell', () => {
    expect([...cellsForAabb(0, 0, 0, 0, 10)]).toEqual([{ x: 0, y: 0 }]);
  });
});

describe('cellsForCircle', () => {
  it('returns the bounding-box cells of the circle', () => {
    const cells = [...cellsForCircle(0, 0, 5, 10)];
    expect(cells).toEqual([
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('returns a single cell when r is smaller than half the cell and centered', () => {
    expect([...cellsForCircle(15, 15, 2, 10)]).toEqual([{ x: 1, y: 1 }]);
  });

  it('expands beyond the center cell when radius crosses a boundary', () => {
    const cells = [...cellsForCircle(15, 15, 6, 10)];
    expect(cells).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });
});
