import { describe, expect, it } from 'vitest';

import { moveToward, normalize, scaleToSpeed } from './vec';

describe('normalize', () => {
  it('returns a unit vector for a non-zero input', () => {
    const v = normalize(3, 4);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });

  it('preserves direction', () => {
    const v = normalize(0, -5);
    expect(v.x).toBe(0);
    expect(v.y).toBeCloseTo(-1);
  });

  it('returns the zero vector for a zero-length input', () => {
    expect(normalize(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('scaleToSpeed', () => {
  it('rescales to the requested speed, preserving direction', () => {
    const v = scaleToSpeed(3, 4, 10);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(10);
    expect(v.x).toBeCloseTo(6);
    expect(v.y).toBeCloseTo(8);
  });

  it('handles an already-unit input', () => {
    const v = scaleToSpeed(1, 0, 7);
    expect(v).toEqual({ x: 7, y: 0 });
  });

  it('handles a negative-axis direction', () => {
    const v = scaleToSpeed(0, -1, 3);
    expect(v.x).toBe(0);
    expect(v.y).toBeCloseTo(-3);
  });

  it('returns the zero vector for a zero-length input', () => {
    expect(scaleToSpeed(0, 0, 100)).toEqual({ x: 0, y: 0 });
  });

  it('a diagonal axis input is not faster than a cardinal one', () => {
    const diag = scaleToSpeed(1, 1, 5);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(5);
  });
});

describe('moveToward', () => {
  it('steps the full delta along the line to the target', () => {
    const v = moveToward({ x: 0, y: 0 }, { x: 10, y: 0 }, 3);
    expect(v).toEqual({ x: 3, y: 0 });
  });

  it('steps diagonally at the requested distance', () => {
    const v = moveToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 2.5);
    expect(v.x).toBeCloseTo(1.5);
    expect(v.y).toBeCloseTo(2);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(2.5);
  });

  it('lands exactly on the target when delta equals the distance', () => {
    expect(moveToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 5)).toEqual({ x: 3, y: 4 });
  });

  it('does not overshoot when delta exceeds the distance', () => {
    expect(moveToward({ x: 0, y: 0 }, { x: 3, y: 4 }, 100)).toEqual({ x: 3, y: 4 });
  });

  it('stays put on a zero distance', () => {
    expect(moveToward({ x: 2, y: 2 }, { x: 2, y: 2 }, 1)).toEqual({ x: 2, y: 2 });
  });

  it('settles on the target across repeated calls', () => {
    let p = { x: 0, y: 0 };
    for (let i = 0; i < 10; i++)
      p = moveToward(p, { x: 4, y: 0 }, 1);
    expect(p).toEqual({ x: 4, y: 0 });
  });

  it('leaves the position unchanged for delta = 0', () => {
    expect(moveToward({ x: 1, y: -1 }, { x: 5, y: 5 }, 0)).toEqual({ x: 1, y: -1 });
  });

  it('moves away from the target for a negative delta, as Unity and Godot do', () => {
    // 10 units out along +y; a -3 step lands 13 units from the target.
    const v = moveToward({ x: 0, y: 0 }, { x: 0, y: 10 }, -3);
    expect(v).toEqual({ x: 0, y: -3 });
    expect(Math.hypot(v.x, v.y - 10)).toBeCloseTo(13);
  });

  it('returns the target rather than NaN for a negative delta at zero distance', () => {
    expect(moveToward({ x: 2, y: 2 }, { x: 2, y: 2 }, -1)).toEqual({ x: 2, y: 2 });
  });
});
