import { describe, expect, it } from 'vitest';

import {
  QUAT_IDENTITY,
  quatConjugate,
  quatForward,
  quatFromAxisAngle,
  quatMul,
  quatNormalize,
  quatRotate,
  quatUp,
} from './quat';
import { vec3Cross, vec3Dot, vec3Length } from './vec3';

const Y = { x: 0, y: 1, z: 0 };
const Z = { x: 0, y: 0, z: 1 };
const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;

function len(q: { w: number; x: number; y: number; z: number }): number {
  return Math.hypot(q.w, q.x, q.y, q.z);
}

describe('the QUAT_IDENTITY constant', () => {
  it('is the identity rotation, and is frozen', () => {
    expect(QUAT_IDENTITY).toEqual({ w: 1, x: 0, y: 0, z: 0 });
    expect(Object.isFrozen(QUAT_IDENTITY)).toBe(true);
    // Rotating by it changes nothing.
    const v = { x: 3, y: -4, z: 12 };
    expect(quatRotate(QUAT_IDENTITY, v)).toEqual(v);
  });
});

describe('quatConjugate', () => {
  it('negates the imaginary part and keeps the scalar part', () => {
    expect(quatConjugate({ w: 1, x: 2, y: 3, z: 4 })).toEqual({ w: 1, x: -2, y: -3, z: -4 });
  });

  it('undoes a rotation when applied after it', () => {
    const q = quatFromAxisAngle(Y, 0.7);
    const back = quatRotate(quatConjugate(q), quatRotate(q, { x: 1, y: 2, z: 3 }));
    expect(back.x).toBeCloseTo(1, 10);
    expect(back.y).toBeCloseTo(2, 10);
    expect(back.z).toBeCloseTo(3, 10);
  });
});

describe('quatMul', () => {
  it('treats the identity as a no-op on either side', () => {
    const q = quatFromAxisAngle(Y, 0.7);
    expect(quatMul(QUAT_IDENTITY, q)).toEqual(q);
    expect(quatMul(q, QUAT_IDENTITY)).toEqual(q);
  });

  it('composes rotations — applying b first, then a', () => {
    const quarterY = quatFromAxisAngle(Y, QUARTER_TURN);
    const quarterZ = quatFromAxisAngle(Z, QUARTER_TURN);
    const composed = quatMul(quarterY, quarterZ);

    const v = { x: 1, y: 0, z: 0 };
    // quatMul(a, b) means b first, then a. Compared per component rather than
    // deeply: the two paths reach the same rotation by different arithmetic, so
    // they agree to ~1e-16 rather than bit-for-bit.
    const both = quatRotate(composed, v);
    const stepwise = quatRotate(quarterY, quatRotate(quarterZ, v));
    expect(both.x).toBeCloseTo(stepwise.x, 10);
    expect(both.y).toBeCloseTo(stepwise.y, 10);
    expect(both.z).toBeCloseTo(stepwise.z, 10);
  });

  it('is associative', () => {
    const a = quatFromAxisAngle({ x: 1, y: 0, z: 0 }, 0.3);
    const b = quatFromAxisAngle(Y, 0.5);
    const c = quatFromAxisAngle(Z, 0.9);
    const left = quatMul(quatMul(a, b), c);
    const right = quatMul(a, quatMul(b, c));

    expect(left.w).toBeCloseTo(right.w, 12);
    expect(left.x).toBeCloseTo(right.x, 12);
    expect(left.y).toBeCloseTo(right.y, 12);
    expect(left.z).toBeCloseTo(right.z, 12);
  });

  it('keeps a pair of unit rotations unit', () => {
    const a = quatFromAxisAngle({ x: 1, y: 2, z: 3 }, 1.1);
    const b = quatFromAxisAngle({ x: -2, y: 1, z: 0 }, 0.4);
    expect(len(quatMul(a, b))).toBeCloseTo(1, 12);
  });
});

describe('quatFromAxisAngle', () => {
  it('produces a unit quaternion from a unit axis', () => {
    expect(len(quatFromAxisAngle(Y, 1.234))).toBeCloseTo(1, 12);
  });

  it('normalises a non-unit axis, so only its direction matters', () => {
    const unit = quatFromAxisAngle(Z, 0.8);
    const scaled = quatFromAxisAngle({ x: 0, y: 0, z: 7 }, 0.8);
    expect(scaled.w).toBeCloseTo(unit.w, 12);
    expect(scaled.z).toBeCloseTo(unit.z, 12);
  });

  it('gives the identity for a zero angle or a zero axis', () => {
    expect(quatFromAxisAngle(Y, 0)).toEqual({ w: 1, x: 0, y: 0, z: 0 });
    expect(quatFromAxisAngle({ x: 0, y: 0, z: 0 }, 1)).toEqual({ w: 1, x: 0, y: 0, z: 0 });
  });

  it('rotates right-handed about the axis', () => {
    // +90° about +Y takes +Z to +X and -Z to -X.
    const q = quatFromAxisAngle(Y, QUARTER_TURN);
    const x = quatRotate(q, Z);
    expect(x.x).toBeCloseTo(1, 12);
    expect(x.z).toBeCloseTo(0, 12);
  });

  it('turns a half turn into a full reversal', () => {
    const q = quatFromAxisAngle(Y, HALF_TURN);
    const out = quatRotate(q, { x: 1, y: 0, z: 0 });
    expect(out.x).toBeCloseTo(-1, 12);
  });
});

describe('quatNormalize', () => {
  it('rescales to unit length', () => {
    const q = quatNormalize({ w: 2, x: 0, y: 0, z: 0 });
    expect(q).toEqual({ w: 1, x: 0, y: 0, z: 0 });
  });

  it('falls back to the identity for a zero quaternion', () => {
    expect(quatNormalize({ w: 0, x: 0, y: 0, z: 0 })).toEqual({ w: 1, x: 0, y: 0, z: 0 });
  });
});

describe('quatRotate', () => {
  it('preserves length for a unit quaternion', () => {
    const q = quatFromAxisAngle({ x: 1, y: 1, z: 1 }, 0.9);
    const v = { x: 3, y: -4, z: 12 };
    expect(vec3Length(quatRotate(q, v))).toBeCloseTo(vec3Length(v), 10);
  });

  it('preserves dot products, so angles between vectors survive rotation', () => {
    const q = quatFromAxisAngle({ x: 1, y: -2, z: 0.5 }, 1.7);
    const a = { x: 1, y: 2, z: 3 };
    const b = { x: -4, y: 5, z: 6 };
    expect(vec3Dot(quatRotate(q, a), quatRotate(q, b))).toBeCloseTo(vec3Dot(a, b), 10);
  });

  it('preserves the handedness of a cross product', () => {
    const q = quatFromAxisAngle(Y, 0.6);
    const a = { x: 1, y: 0.5, z: -2 };
    const b = { x: 0, y: 3, z: 1 };
    const rotatedCross = quatRotate(q, vec3Cross(a, b));
    const crossOfRotated = vec3Cross(quatRotate(q, a), quatRotate(q, b));
    expect(rotatedCross.x).toBeCloseTo(crossOfRotated.x, 10);
    expect(rotatedCross.y).toBeCloseTo(crossOfRotated.y, 10);
    expect(rotatedCross.z).toBeCloseTo(crossOfRotated.z, 10);
  });

  it('round-trips: rotating back by the inverse restores the vector', () => {
    const v = { x: 2, y: -1, z: 0.5 };
    const there = quatRotate(quatFromAxisAngle({ x: 1, y: 2, z: 3 }, 1.2), v);
    const back = quatRotate(quatFromAxisAngle({ x: 1, y: 2, z: 3 }, -1.2), there);
    expect(back.x).toBeCloseTo(v.x, 10);
    expect(back.y).toBeCloseTo(v.y, 10);
    expect(back.z).toBeCloseTo(v.z, 10);
  });
});

describe('quatForward and quatUp', () => {
  it('reads the local -Z and +Y axes under the identity', () => {
    expect(quatForward(QUAT_IDENTITY)).toEqual({ x: 0, y: 0, z: -1 });
    expect(quatUp(QUAT_IDENTITY)).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('points -Z left after a quarter turn about +Y', () => {
    const q = quatFromAxisAngle(Y, QUARTER_TURN);
    const f = quatForward(q);
    expect(f.x).toBeCloseTo(-1, 12);
    expect(f.z).toBeCloseTo(0, 12);
  });

  it('leaves up unchanged for a yaw-only turn, and flips it for a roll', () => {
    expect(quatUp(quatFromAxisAngle(Y, 1.1)).y).toBeCloseTo(1, 12);

    const rolled = quatUp(quatFromAxisAngle(Z, HALF_TURN));
    expect(rolled.y).toBeCloseTo(-1, 12);
  });
});
