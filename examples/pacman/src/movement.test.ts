import type { Dir } from './maze';
import type { Heading, Place } from './movement';

import { describe, expect, it } from 'vitest';

import { COLS, DOWN, passable, RIGHT, TUNNEL_ROW, UP } from './maze';
import { atCentre, stepMover } from './movement';

const keepGoing = (_c: number, _r: number, h: Heading): Dir => ({ dx: h.dx, dy: h.dy }) as Dir;

function mover(x: number, y: number, dir: Dir): { h: Heading; p: Place } {
  return { h: { dx: dir.dx, dy: dir.dy }, p: { x, y } };
}

describe('stepMover', () => {
  it('moves along its heading and stays on the axis', () => {
    const { h, p } = mover(1, 1, RIGHT);
    stepMover(p, h, 2.5, passable, keepGoing);
    expect(p).toEqual({ x: 3.5, y: 1 });
  });

  it('stops at a wall instead of entering it', () => {
    const { h, p } = mover(3, 1, { dx: -1, dy: 0 });
    stepMover(p, h, 10, passable, keepGoing);
    expect(p.x).toBe(1);
    expect(atCentre(p)).toBe(true);
  });

  it('asks to decide only at tile centres, once per tile', () => {
    const seen: number[] = [];
    const { h, p } = mover(1.5, 1, RIGHT);
    stepMover(p, h, 3, passable, (c, r, heading) => {
      seen.push(c);
      return keepGoing(c, r, heading);
    });
    expect(seen).toEqual([2, 3, 4]);
  });

  it('turns at the corner even when one step carries it past', () => {
    const { h, p } = mover(1, 1, RIGHT);
    // One big step: must still turn down at column 6 rather than overshoot into the wall.
    stepMover(p, h, 6, passable, (c, r, heading) => (c === 6 && r === 1 ? DOWN : keepGoing(c, r, heading)));
    expect(p).toEqual({ x: 6, y: 2 });
    expect(h.dy).toBe(1);
  });

  it('stays put when decide returns null', () => {
    const { h, p } = mover(1, 1, RIGHT);
    stepMover(p, h, 5, passable, () => null);
    expect(p).toEqual({ x: 1, y: 1 });
  });

  it('refuses a decided direction that is blocked', () => {
    const { h, p } = mover(1, 1, RIGHT);
    stepMover(p, h, 5, passable, () => UP);
    expect(p).toEqual({ x: 1, y: 1 });
  });

  it('wraps through the tunnel in both directions', () => {
    const left = mover(0, TUNNEL_ROW, { dx: -1, dy: 0 });
    stepMover(left.p, left.h, 1, passable, keepGoing);
    expect(left.p.x).toBe(COLS);
    stepMover(left.p, left.h, 1, passable, keepGoing);
    expect(left.p.x).toBe(COLS - 1);

    const right = mover(COLS - 1, TUNNEL_ROW, RIGHT);
    stepMover(right.p, right.h, 1, passable, keepGoing);
    expect(right.p.x).toBe(-1);
    stepMover(right.p, right.h, 1, passable, keepGoing);
    expect(right.p.x).toBe(0);
  });

  it('resumes from mid-tile after its heading is flipped', () => {
    const { h, p } = mover(3.25, 1, { dx: -1, dy: 0 });
    h.dx = 1;
    stepMover(p, h, 0.75, passable, keepGoing);
    expect(p.x).toBe(4);
  });
});
