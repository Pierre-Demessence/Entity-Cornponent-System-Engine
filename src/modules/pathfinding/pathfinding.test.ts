import type { PathNode } from './pathfinding';

import { describe, expect, it } from 'vitest';

import { findPath } from './pathfinding';

/**
 * Build a traversable predicate from a `#`/`.` ASCII grid. `.` walkable,
 * anything else blocked. Rows are separated by newlines; leading /
 * trailing whitespace is stripped.
 */
function gridTraversable(ascii: string): (x: number, y: number) => boolean {
  const rows = ascii.trim().split('\n').map(r => r.trim());
  const h = rows.length;
  const w = rows[0].length;
  return (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h)
      return false;
    return rows[y][x] === '.';
  };
}

function openGrid(w: number, h: number): (x: number, y: number) => boolean {
  return (x, y) => x >= 0 && y >= 0 && x < w && y < h;
}

describe('findPath', () => {
  it('returns empty array when from equals to', () => {
    expect(findPath({
      from: { x: 5, y: 5 },
      to: { x: 5, y: 5 },
      traversable: openGrid(10, 10),
    })).toEqual([]);
  });

  it('finds a straight horizontal path', () => {
    const path = findPath({
      from: { x: 0, y: 0 },
      to: { x: 3, y: 0 },
      traversable: openGrid(10, 10),
    });
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it('prefers straight cardinal paths over diagonal zigzags', () => {
    const path = findPath({
      from: { x: 2, y: 5 },
      to: { x: 7, y: 5 },
      traversable: openGrid(10, 10),
    });
    expect(path).not.toBeNull();
    for (const node of path!)
      expect(node.y).toBe(5);
  });

  it('finds a diagonal path in open space (Chebyshev)', () => {
    const path = findPath({
      from: { x: 0, y: 0 },
      to: { x: 3, y: 3 },
      traversable: openGrid(10, 10),
    });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(3);
    expect(path!.at(-1)).toEqual({ x: 3, y: 3 });
  });

  it('navigates around a wall', () => {
    const path = findPath({
      from: { x: 1, y: 2 },
      to: { x: 5, y: 2 },
      traversable: gridTraversable(`
        ..........
        ..........
        ...#......
        ...#......
        ...#......
        ..........
      `),
    });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: 5, y: 2 });
  });

  it('returns null for unreachable target', () => {
    const path = findPath({
      from: { x: 0, y: 0 },
      to: { x: 5, y: 5 },
      traversable: gridTraversable(`
        ..........
        ..........
        ..........
        ..........
        ....###...
        ....#.#...
        ....###...
        ..........
        ..........
        ..........
      `),
    });
    expect(path).toBeNull();
  });

  it('returns null when goal itself is not traversable', () => {
    expect(findPath({
      from: { x: 0, y: 0 },
      to: { x: 3, y: 3 },
      traversable: (x, y) => !(x === 3 && y === 3) && x >= 0 && y >= 0 && x < 10 && y < 10,
    })).toBeNull();
  });

  it('respects maxCost', () => {
    const path = findPath({
      from: { x: 0, y: 0 },
      maxCost: 10,
      to: { x: 15, y: 15 },
      traversable: openGrid(20, 20),
    });
    expect(path).toBeNull();
  });

  it('supports custom 4-directional neighbors', () => {
    const path = findPath({
      from: { x: 0, y: 0 },
      to: { x: 2, y: 2 },
      traversable: openGrid(5, 5),
      cost: () => 1,
      heuristic: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
      neighbors: (x, y) => [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ],
    });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(4);
    for (const node of path!) {
      expect(node.x === 0 || node.x === 1 || node.x === 2).toBe(true);
    }
    const diagonals = path!.filter((n, i) => {
      if (i === 0)
        return n.x !== 0 && n.y !== 0;
      const prev = path![i - 1];
      return n.x !== prev.x && n.y !== prev.y;
    });
    expect(diagonals).toHaveLength(0);
  });

  it('routes around expensive terrain via custom cost', () => {
    // Single swamp tile at (2,2) costs 100 to enter; every other step
    // costs 2. Any path that steps on (2,2) costs ≥100; the optimal
    // detour skirts it.
    const path = findPath({
      from: { x: 0, y: 2 },
      to: { x: 4, y: 2 },
      traversable: openGrid(5, 5),
      cost: (_fx, _fy, tx, ty) => (tx === 2 && ty === 2) ? 100 : 2,
      heuristic: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) * 2,
    });
    expect(path).not.toBeNull();
    for (const node of path!) {
      expect(node.x === 2 && node.y === 2).toBe(false);
    }
    expect(path!.at(-1)).toEqual({ x: 4, y: 2 });
  });

  it('returns waypoints that form a connected chain from start', () => {
    const path = findPath({
      from: { x: 0, y: 0 },
      to: { x: 4, y: 2 },
      traversable: openGrid(10, 10),
    }) as PathNode[];
    let prev = { x: 0, y: 0 };
    for (const step of path) {
      expect(Math.abs(step.x - prev.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(step.y - prev.y)).toBeLessThanOrEqual(1);
      prev = step;
    }
  });
});
