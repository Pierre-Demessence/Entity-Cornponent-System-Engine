import type { EntityId } from '#entity-id';

import { describe, expect, it } from 'vitest';

import { makeGridSyncOnMove } from './grid-sync';
import { HashGrid2D } from './hash-grid-2d';

const id = 1 as EntityId;

describe('makeGridSyncOnMove', () => {
  it('moves the entity when prev/next project to different cells', () => {
    const grid = new HashGrid2D();
    grid.add(id, 0, 0);
    const onMove = makeGridSyncOnMove({ cellSize: 10, grid });

    onMove(null, id, { x: 5, y: 5 }, { x: 15, y: 5 });

    expect(grid.getAt(0, 0)?.has(id) ?? false).toBe(false);
    expect(grid.getAt(1, 0)?.has(id) ?? false).toBe(true);
  });

  it('is a no-op when prev/next project to the same cell', () => {
    const grid = new HashGrid2D();
    grid.add(id, 0, 0);
    const onMove = makeGridSyncOnMove({ cellSize: 10, grid });

    onMove(null, id, { x: 1, y: 1 }, { x: 9, y: 9 });

    expect(grid.getAt(0, 0)?.has(id) ?? false).toBe(true);
  });

  it('handles negative coordinates via flooring projection', () => {
    const grid = new HashGrid2D();
    grid.add(id, 0, 0);
    const onMove = makeGridSyncOnMove({ cellSize: 10, grid });

    onMove(null, id, { x: 1, y: 1 }, { x: -1, y: -1 });

    expect(grid.getAt(0, 0)?.has(id) ?? false).toBe(false);
    expect(grid.getAt(-1, -1)?.has(id) ?? false).toBe(true);
  });

  it('respects cellSize', () => {
    const grid = new HashGrid2D();
    grid.add(id, 0, 0);
    const onMove = makeGridSyncOnMove({ cellSize: 64, grid });

    onMove(null, id, { x: 10, y: 10 }, { x: 63, y: 63 });
    expect(grid.getAt(0, 0)?.has(id) ?? false).toBe(true);

    onMove(null, id, { x: 63, y: 63 }, { x: 65, y: 10 });
    expect(grid.getAt(0, 0)?.has(id) ?? false).toBe(false);
    expect(grid.getAt(1, 0)?.has(id) ?? false).toBe(true);
  });

  it('ignores its ctx argument', () => {
    const grid = new HashGrid2D();
    grid.add(id, 0, 0);
    const onMove = makeGridSyncOnMove({ cellSize: 10, grid });

    expect(() => {
      onMove({ anything: 'here' }, id, { x: 1, y: 1 }, { x: 15, y: 1 });
    }).not.toThrow();
    expect(grid.getAt(1, 0)?.has(id) ?? false).toBe(true);
  });
});
