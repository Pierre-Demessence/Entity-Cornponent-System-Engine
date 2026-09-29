import { describe, expect, it } from 'vitest';

import {
  COLS,
  HOUSE_CENTER,
  isDoor,
  isWall,
  MAZE_ROWS,
  noUpTile,
  passable,
  pellets,
  ROWS,
  TUNNEL_ROW,
} from './maze';

describe('maze layout', () => {
  it('is a rectangle of COLS x ROWS', () => {
    expect(MAZE_ROWS).toHaveLength(ROWS);
    for (const row of MAZE_ROWS)
      expect(row).toHaveLength(COLS);
  });

  it('is left/right symmetric', () => {
    for (const row of MAZE_ROWS)
      expect([...row].reverse().join('')).toBe(row);
  });

  it('holds 240 dots and 4 power pellets', () => {
    const all = pellets();
    expect(all.filter(p => p.power)).toHaveLength(4);
    expect(all).toHaveLength(244);
  });

  it('never places a pellet inside a wall', () => {
    for (const p of pellets())
      expect(isWall(p.c, p.r)).toBe(false);
  });
});

describe('tile queries', () => {
  it('treats the tunnel row as open past both edges, and everything else out of bounds as wall', () => {
    expect(isWall(-1, TUNNEL_ROW)).toBe(false);
    expect(isWall(COLS, TUNNEL_ROW)).toBe(false);
    expect(isWall(-1, 1)).toBe(true);
    expect(isWall(0, -1)).toBe(true);
  });

  it('lets only ghosts heading through the door pass it', () => {
    expect(isDoor(13, 12)).toBe(true);
    expect(passable(13, 12)).toBe(false);
    expect(passable(13, 12, true)).toBe(true);
  });

  it('keeps the ghost house interior open', () => {
    expect(passable(Math.floor(HOUSE_CENTER.x), HOUSE_CENTER.y)).toBe(true);
  });

  it('marks the four no-upturn tiles as open path', () => {
    for (const [c, r] of [[12, 11], [15, 11], [12, 23], [15, 23]] as const) {
      expect(noUpTile(c, r)).toBe(true);
      expect(passable(c, r)).toBe(true);
    }
  });
});
