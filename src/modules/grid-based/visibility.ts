export interface Point {
  x: number;
  y: number;
}

export interface VisibilityGrid {
  blocksSight: (x: number, y: number) => boolean;
  isInBounds: (x: number, y: number) => boolean;
}

// Recursive shadowcasting FOV — 8 octant multipliers.
const MULT: readonly (readonly number[])[] = [
  [1, 0, 0, -1, -1, 0, 0, 1],
  [0, 1, -1, 0, 0, -1, 1, 0],
  [0, 1, 1, 0, 0, -1, -1, 0],
  [1, 0, 0, 1, -1, 0, 0, -1],
];

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

function addVisible(
  grid: VisibilityGrid,
  seen: Set<string>,
  visible: Point[],
  x: number,
  y: number,
): void {
  if (!grid.isInBounds(x, y))
    return;
  const key = keyOf(x, y);
  if (seen.has(key))
    return;
  seen.add(key);
  visible.push({ x, y });
}

function castLight(
  grid: VisibilityGrid,
  cx: number,
  cy: number,
  radius: number,
  row: number,
  startSlope: number,
  endSlope: number,
  octant: number,
  seen: Set<string>,
  visible: Point[],
): void {
  if (startSlope < endSlope)
    return;

  let currentStart = startSlope;
  let nextStart = currentStart;

  for (let j = row; j <= radius; j++) {
    let blocked = false;

    for (let dx = -j; dx <= 0; dx++) {
      const dy = -j;
      const mx = cx + dx * MULT[0][octant] + dy * MULT[1][octant];
      const my = cy + dx * MULT[2][octant] + dy * MULT[3][octant];

      const leftSlope = (dx - 0.5) / (dy + 0.5);
      const rightSlope = (dx + 0.5) / (dy - 0.5);

      if (rightSlope > currentStart)
        continue;
      if (leftSlope < endSlope)
        break;

      if (dx * dx + dy * dy <= radius * radius)
        addVisible(grid, seen, visible, mx, my);

      const blocks = grid.isInBounds(mx, my) && grid.blocksSight(mx, my);
      if (blocked) {
        if (blocks) {
          nextStart = rightSlope;
          continue;
        }

        blocked = false;
        currentStart = nextStart;
      }
      else if (blocks && j < radius) {
        blocked = true;
        castLight(grid, cx, cy, radius, j + 1, currentStart, leftSlope, octant, seen, visible);
        nextStart = rightSlope;
      }
    }

    if (blocked)
      break;
  }
}

/**
 * Compute field-of-view tiles using recursive shadowcasting over 8 octants.
 * Returns the visible tile coordinates for the current cast, including origin.
 */
export function computeFieldOfView(
  grid: VisibilityGrid,
  originX: number,
  originY: number,
  radius: number,
): Point[] {
  if (radius < 0 || !grid.isInBounds(originX, originY))
    return [];

  const visible: Point[] = [];
  const seen = new Set<string>();

  addVisible(grid, seen, visible, originX, originY);
  for (let octant = 0; octant < 8; octant++)
    castLight(grid, originX, originY, radius, 1, 1.0, 0.0, octant, seen, visible);

  return visible;
}

export function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Point[] {
  const points: Point[] = [];

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;

  while (true) {
    points.push({ x: cx, y: cy });
    if (cx === x1 && cy === y1)
      break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
  }

  return points;
}

/**
 * Returns true when all intermediate line tiles are both in-bounds and
 * transparent. Origin and destination tiles are ignored for blocking checks.
 */
export function hasLineOfSight(
  grid: VisibilityGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean {
  const line = bresenhamLine(x0, y0, x1, y1);

  for (let i = 1; i < line.length - 1; i++) {
    const p = line[i]!;
    if (!grid.isInBounds(p.x, p.y) || grid.blocksSight(p.x, p.y))
      return false;
  }

  return true;
}
