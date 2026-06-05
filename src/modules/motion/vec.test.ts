import { describe, expect, it } from 'vitest';

import { normalize, scaleToSpeed } from './vec';

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
