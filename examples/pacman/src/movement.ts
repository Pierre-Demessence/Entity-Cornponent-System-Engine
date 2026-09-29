import type { Dir } from './maze';

import { COLS } from './maze';

/** Where a mover is, in tile units; it only ever sits on a tile row or a tile column. */
export interface Place { x: number; y: number }

/** The way a mover is heading: one of the four axis directions, or `0, 0` when parked. */
export interface Heading { dx: number; dy: number }

/**
 * Picks the direction to leave tile `(c, r)` by, or `null` to stop there. The
 * mover is exactly on the tile centre when this is asked, never between tiles,
 * so turns can only happen at intersections.
 */
export type Decide = (c: number, r: number, heading: Heading) => Dir | null;

const EPS = 1e-6;

function onCentre(v: number): boolean {
  return Math.abs(v - Math.round(v)) < EPS;
}

export function atCentre(p: Place): boolean {
  return onCentre(p.x) && onCentre(p.y);
}

/**
 * Advances `p` along `h` by `dist` tiles. Every time it lands on a tile
 * centre it asks `decide` which way to go on, so a large `dist` (a slow frame)
 * still turns at the right corner rather than overshooting it. Wraps through
 * the tunnel: a mover reaching the virtual tile just outside one edge reappears
 * on the virtual tile outside the other.
 */
export function stepMover(
  p: Place,
  h: Heading,
  dist: number,
  passable: (c: number, r: number) => boolean,
  decide: Decide,
): void {
  let left = dist;
  while (left > EPS) {
    if (atCentre(p)) {
      p.x = Math.round(p.x);
      p.y = Math.round(p.y);
      const next = decide(p.x, p.y, h);
      if (!next)
        return;
      h.dx = next.dx;
      h.dy = next.dy;
      if (!passable(p.x + h.dx, p.y + h.dy))
        return;
    }
    if (h.dx === 0 && h.dy === 0)
      return;

    const along = h.dx !== 0 ? p.x : p.y;
    const sign = h.dx !== 0 ? h.dx : h.dy;
    const target = sign > 0 ? Math.floor(along + EPS) + 1 : Math.ceil(along - EPS) - 1;
    const step = Math.min(left, Math.abs(target - along));
    p.x += h.dx * step;
    p.y += h.dy * step;
    left -= step;
    if (step >= Math.abs(target - along) - EPS) {
      p.x = h.dx !== 0 ? target : p.x;
      p.y = h.dy !== 0 ? target : p.y;
    }

    if (h.dx < 0 && p.x <= -1 + EPS)
      p.x = COLS;
    else if (h.dx > 0 && p.x >= COLS - EPS)
      p.x = -1;
  }
}
