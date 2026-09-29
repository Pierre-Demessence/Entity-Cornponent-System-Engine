import { describe, expect, it } from 'vitest';

import { chaseTarget, chooseGhostDirection, SCATTER_CORNERS } from './ghosts';
import { DOWN, LEFT, passable, RIGHT, UP } from './maze';

const open = (c: number, r: number): boolean => passable(c, r);

describe('chaseTarget', () => {
  const base = { blinky: { x: 10, y: 10 }, ghost: { x: 5, y: 5 }, pac: { x: 14, y: 20 }, pacDir: RIGHT };

  it('has Blinky aim straight at Pac-Man', () => {
    expect(chaseTarget('blinky', base)).toEqual({ x: 14, y: 20 });
  });

  it('has Pinky aim four tiles ahead of Pac-Man', () => {
    expect(chaseTarget('pinky', base)).toEqual({ x: 18, y: 20 });
    expect(chaseTarget('pinky', { ...base, pacDir: DOWN })).toEqual({ x: 14, y: 24 });
  });

  it('reproduces the original upward-heading overflow for Pinky', () => {
    expect(chaseTarget('pinky', { ...base, pacDir: UP })).toEqual({ x: 10, y: 16 });
  });

  it('has Inky mirror Blinky through the point two tiles ahead of Pac-Man', () => {
    // pivot = (16, 20); doubled away from Blinky (10, 10) = (22, 30)
    expect(chaseTarget('inky', base)).toEqual({ x: 22, y: 30 });
  });

  it('has Clyde chase from afar and retreat to his corner up close', () => {
    expect(chaseTarget('clyde', base)).toEqual(base.pac);
    expect(chaseTarget('clyde', { ...base, ghost: { x: 14, y: 15 } })).toEqual(SCATTER_CORNERS.clyde);
  });
});

describe('chooseGhostDirection', () => {
  it('never reverses when another exit exists', () => {
    // Corridor row 1, heading right at (6, 1): can continue right or go down, never back left.
    const d = chooseGhostDirection(6, 1, RIGHT, { x: 0, y: 1 }, { noUp: false, passable: open });
    expect(d).not.toEqual(LEFT);
  });

  it('takes the exit whose next tile is closest to the target', () => {
    // At (6, 5) heading right, the corridor row 5 continues right; a target far below prefers down at (6, 6)
    const d = chooseGhostDirection(6, 5, RIGHT, { x: 6, y: 30 }, { noUp: false, passable: open });
    expect(d).toEqual(DOWN);
  });

  it('breaks ties in favour of up, left, down, right', () => {
    // (6, 5): open up (6,4), down (6,6), right (7,5). A target equidistant up/down picks up.
    const d = chooseGhostDirection(6, 5, RIGHT, { x: 6, y: 5 }, { noUp: false, passable: open });
    expect(d).toEqual(UP);
  });

  it('honours the no-upturn tiles', () => {
    const d = chooseGhostDirection(6, 5, RIGHT, { x: 6, y: 0 }, { noUp: true, passable: open });
    expect(d).not.toEqual(UP);
  });

  it('wanders at random when frightened, still never straight back', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const d = chooseGhostDirection(6, 5, RIGHT, { x: 0, y: 0 }, { noUp: false, passable: open, rand: () => i / 40 });
      seen.add(`${d.dx},${d.dy}`);
    }
    expect(seen.has('-1,0')).toBe(false);
    expect(seen.size).toBeGreaterThan(1);
  });

  it('turns around at a dead end', () => {
    const wallsAround = (c: number, r: number): boolean => c === 0 && r === 0;
    const d = chooseGhostDirection(1, 0, RIGHT, { x: 9, y: 9 }, { noUp: false, passable: wallsAround });
    expect(d).toEqual(LEFT);
  });
});
