import { describe, expect, it } from 'vitest';

import {
  vec3Add,
  vec3AddScaled,
  vec3ClampLength,
  vec3Cross,
  vec3Distance,
  vec3Dot,
  vec3Length,
  vec3LengthSq,
  vec3Lerp,
  vec3Negate,
  vec3Normalize,
  vec3RandomUnit,
  vec3Reflect,
  vec3Scale,
  vec3ScaleToLength,
  vec3Sub,
} from './vec3';

const X = { x: 1, y: 0, z: 0 };
const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };

function makeSeeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('vec3 arithmetic', () => {
  it('adds, subtracts and scales component-wise', () => {
    expect(vec3Add({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: 11, y: 22, z: 33 });
    expect(vec3Sub({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 })).toEqual({ x: -9, y: -18, z: -27 });
    expect(vec3Scale({ x: 1, y: -2, z: 3 }, 2)).toEqual({ x: 2, y: -4, z: 6 });
    expect(vec3Negate({ x: 1, y: -2, z: 3 })).toEqual({ x: -1, y: 2, z: -3 });
  });

  it('accumulates b * s onto a in one call', () => {
    expect(vec3AddScaled({ x: 1, y: 1, z: 1 }, { x: 2, y: 4, z: 6 }, 0.5))
      .toEqual({ x: 2, y: 3, z: 4 });
  });

  it('lerps component-wise, unclamped', () => {
    expect(vec3Lerp({ x: 0, y: 0, z: 0 }, { x: 10, y: 20, z: 30 }, 0.5))
      .toEqual({ x: 5, y: 10, z: 15 });
    // t outside [0,1] extrapolates rather than clamping.
    expect(vec3Lerp({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 2).x).toBe(20);
  });

  it('never mutates its inputs', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: 4, y: 5, z: 6 };
    vec3Add(a, b);
    vec3Sub(a, b);
    vec3Scale(a, 3);
    vec3AddScaled(a, b, 2);
    vec3Negate(a);
    vec3Lerp(a, b, 0.5);
    vec3Normalize(a);
    vec3ScaleToLength(a, 5);
    vec3ClampLength(a, 1);
    vec3Reflect(a, Y);

    expect(a).toEqual({ x: 1, y: 2, z: 3 });
    expect(b).toEqual({ x: 4, y: 5, z: 6 });
  });
});

describe('vec3 length and distance', () => {
  it('measures length, squared length and distance', () => {
    expect(vec3Length({ x: 3, y: 4, z: 0 })).toBe(5);
    expect(vec3LengthSq({ x: 3, y: 4, z: 0 })).toBe(25);
    expect(vec3Distance({ x: 0, y: 0, z: 0 }, { x: 0, y: 3, z: 4 })).toBe(5);
    expect(vec3LengthSq({ x: 0, y: 0, z: 0 })).toBe(0);
  });

  it('normalises to unit length, preserving direction', () => {
    const v = vec3Normalize({ x: 0, y: 3, z: 4 });
    expect(vec3Length(v)).toBeCloseTo(1, 12);
    expect(v.y / v.z).toBeCloseTo(3 / 4, 12);
  });

  it('returns zero from normalising a zero vector, not NaN', () => {
    expect(vec3Normalize({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('propagates non-finite input rather than quietly zeroing it', () => {
    // The zero guard keys on an exactly-zero magnitude, not on a finite one.
    expect(vec3Normalize({ x: Number.NaN, y: 0, z: 0 }).x).toBeNaN();
    expect(vec3Normalize({ x: Number.POSITIVE_INFINITY, y: 0, z: 0 }).x).toBeNaN();
  });

  it('scales to an exact length', () => {
    const v = vec3ScaleToLength({ x: 0, y: 3, z: 4 }, 20);
    expect(vec3Length(v)).toBeCloseTo(20, 12);
    expect(v).toEqual({ x: 0, y: 12, z: 16 });
  });

  it('returns zero from scaling a zero vector', () => {
    expect(vec3ScaleToLength({ x: 0, y: 0, z: 0 }, 20)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('clamps length, leaving a short vector untouched', () => {
    const short = { x: 1, y: 0, z: 0 };
    // Same object back: there is nothing to correct.
    expect(vec3ClampLength(short, 10)).toBe(short);

    const long = vec3ClampLength({ x: 0, y: 30, z: 40 }, 5);
    expect(vec3Length(long)).toBeCloseTo(5, 12);
    expect(long.y / long.z).toBeCloseTo(30 / 40, 12);
  });

  it('returns zero from clamping a zero vector or a non-positive budget', () => {
    expect(vec3ClampLength({ x: 0, y: 0, z: 0 }, 10)).toEqual({ x: 0, y: 0, z: 0 });
    expect(vec3ClampLength({ x: 3, y: 4, z: 0 }, 0)).toEqual({ x: 0, y: 0, z: 0 });
    // A negative budget must not flip the direction.
    expect(vec3ClampLength({ x: 3, y: 4, z: 0 }, -5)).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('vec3 products', () => {
  it('dots unit axes into the identity matrix', () => {
    expect(vec3Dot(X, X)).toBe(1);
    expect(vec3Dot(X, Y)).toBe(0);
    expect(vec3Dot(Z, Z)).toBe(1);
  });

  it('crosses right-handed', () => {
    expect(vec3Cross(X, Y)).toEqual(Z);
    expect(vec3Cross(Y, Z)).toEqual(X);
    expect(vec3Cross(Z, X)).toEqual(Y);
  });

  it('crosses anti-commutatively, and perpendicular to both inputs', () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: -4, y: 5, z: 6 };
    expect(vec3Cross(a, b)).toEqual(vec3Negate(vec3Cross(b, a)));
    expect(vec3Dot(vec3Cross(a, b), a)).toBe(0);
    expect(vec3Dot(vec3Cross(a, b), b)).toBe(0);
  });

  it('crosses a parallel pair to zero', () => {
    expect(vec3Cross({ x: 1, y: 2, z: 3 }, { x: 2, y: 4, z: 6 })).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe('vec3Reflect', () => {
  it('flips the component along the normal and keeps the tangent', () => {
    // Travelling down-and-right into a floor: the y component flips.
    const out = vec3Reflect({ x: 1, y: -1, z: 0 }, Y);
    expect(out.x).toBeCloseTo(1, 12);
    expect(out.y).toBeCloseTo(1, 12);
  });

  it('reverses a vector hitting a surface head-on', () => {
    const out = vec3Reflect({ x: 0, y: -5, z: 0 }, Y);
    expect(out.y).toBeCloseTo(5, 12);
  });

  it('preserves length', () => {
    const v = { x: 3, y: -4, z: 12 };
    expect(vec3Length(vec3Reflect(v, Y))).toBeCloseTo(vec3Length(v), 10);
  });
});

describe('vec3RandomUnit', () => {
  it('lands on the unit sphere every time', () => {
    const rand = makeSeeded(1234);
    for (let i = 0; i < 500; i++)
      expect(vec3Length(vec3RandomUnit(rand))).toBeCloseTo(1, 10);
  });

  it('uses Math.random by default, and still lands on the sphere', () => {
    expect(vec3Length(vec3RandomUnit())).toBeCloseTo(1, 10);
  });

  it('is deterministic for a seeded source', () => {
    const first = makeSeeded(7);
    const second = makeSeeded(7);
    const a = Array.from({ length: 5 }, () => vec3RandomUnit(first));
    const b = Array.from({ length: 5 }, () => vec3RandomUnit(second));
    expect(b).toEqual(a);
  });

  it('spreads z across the full range rather than clustering', () => {
    const rand = makeSeeded(99);
    let below = 0;
    let above = 0;
    for (let i = 0; i < 400; i++) {
      const { z } = vec3RandomUnit(rand);
      if (z < -0.5)
        below++;
      if (z > 0.5)
        above++;
    }
    // A uniform sphere puts ~25% of its area in each polar cap.
    expect(below).toBeGreaterThan(60);
    expect(above).toBeGreaterThan(60);
  });
});
