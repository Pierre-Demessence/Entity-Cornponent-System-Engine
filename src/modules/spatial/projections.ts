/**
 * World-space → grid-cell projection helpers.
 *
 * These are pure functions: they project continuous coordinates onto an
 * integer cell grid of a given `cellSize`. They do NOT touch any spatial
 * structure — pair them with {@link HashGrid2D} or any other grid backend.
 *
 * Floor semantics: cells are computed via `Math.floor`, so negative
 * coordinates project to negative cells (e.g. with `cellSize=10`, x=-1 →
 * cell -1, not 0).
 */

export interface CellKey {
  readonly x: number;
  readonly y: number;
}

/** Project a world-space point onto its containing cell. */
export function cellOfPoint(x: number, y: number, cellSize: number): CellKey {
  return { x: Math.floor(x / cellSize), y: Math.floor(y / cellSize) };
}

/**
 * Yield every cell key overlapped by an axis-aligned bounding box.
 * Inclusive of the cells at both `(x,y)` and `(x+w, y+h)`.
 * `w` and `h` should be non-negative; negative values yield no cells.
 */
export function* cellsForAabb(
  x: number,
  y: number,
  w: number,
  h: number,
  cellSize: number,
): Generator<CellKey> {
  const c0 = cellOfPoint(x, y, cellSize);
  const c1 = cellOfPoint(x + w, y + h, cellSize);
  for (let cy = c0.y; cy <= c1.y; cy++) {
    for (let cx = c0.x; cx <= c1.x; cx++) {
      yield { x: cx, y: cy };
    }
  }
}

/**
 * Yield every cell key overlapped by the bounding box of a circle.
 * This is a coarse over-estimate (square enclosing the circle); callers
 * needing exact coverage should filter the yielded cells themselves.
 */
export function* cellsForCircle(
  cx: number,
  cy: number,
  r: number,
  cellSize: number,
): Generator<CellKey> {
  yield* cellsForAabb(cx - r, cy - r, r * 2, r * 2, cellSize);
}
