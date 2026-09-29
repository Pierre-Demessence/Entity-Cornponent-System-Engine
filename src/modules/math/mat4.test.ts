import type { Mat4 } from './mat4';
import type { Vec3 } from './vec3';

import { describe, expect, it } from 'vitest';

import {
  mat4Compose,
  mat4Identity,
  mat4Invert,
  mat4LookAt,
  mat4Multiply,
  mat4Orthographic,
  mat4Perspective,
  mat4TransformDirection,
  mat4TransformPoint,
  mat4TransformVec4,
  mat4Transpose,
} from './mat4';
import { quatFromAxisAngle, quatMul, quatRotate } from './quat';

const Y = { x: 0, y: 1, z: 0 };
const X = { x: 1, y: 0, z: 0 };

function expectMat(actual: Mat4 | null, expected: Mat4): void {
  expect(actual).not.toBeNull();
  expect(actual).toHaveLength(16);
  actual!.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 9));
}

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

const SAMPLE: Mat4 = mat4Compose(
  { x: 3, y: -2, z: 5 },
  quatMul(quatFromAxisAngle(Y, 0.7), quatFromAxisAngle(X, -0.3)),
  { x: 2, y: 0.5, z: 1.5 },
);

describe('mat4Identity', () => {
  it('leaves points unchanged and is a fresh array each call', () => {
    const p = { x: 1, y: -2, z: 3 };
    expectVec(mat4TransformPoint(mat4Identity(), p), p);
    expect(mat4Identity()).not.toBe(mat4Identity());
  });
});

describe('column-major layout', () => {
  it('stores the translation in elements 12, 13, 14', () => {
    const m = mat4Compose({ x: 7, y: 8, z: 9 }, { w: 1, x: 0, y: 0, z: 0 });
    expect(m.slice(12)).toEqual([7, 8, 9, 1]);
  });
});

describe('mat4Multiply', () => {
  it('applies the right-hand matrix first', () => {
    const translate = mat4Compose({ x: 10, y: 0, z: 0 }, { w: 1, x: 0, y: 0, z: 0 });
    const rotate = mat4Compose({ x: 0, y: 0, z: 0 }, quatFromAxisAngle(Y, Math.PI / 2));
    // Rotate +X to -Z, then translate.
    expectVec(mat4TransformPoint(mat4Multiply(translate, rotate), X), { x: 10, y: 0, z: -1 });
    // Translate to (11, 0, 0), then rotate to (0, 0, -11).
    expectVec(mat4TransformPoint(mat4Multiply(rotate, translate), X), { x: 0, y: 0, z: -11 });
  });

  it('has the identity as neutral element', () => {
    expectMat(mat4Multiply(SAMPLE, mat4Identity()), SAMPLE);
    expectMat(mat4Multiply(mat4Identity(), SAMPLE), SAMPLE);
  });
});

describe('mat4Transpose', () => {
  it('swaps rows and columns, and is its own inverse', () => {
    const m = Array.from({ length: 16 }, (_, i) => i);
    const t = mat4Transpose(m);
    expect(t[1]).toBe(4);
    expect(t[4]).toBe(1);
    expect(t[12]).toBe(3);
    expect(mat4Transpose(t)).toEqual(m);
  });
});

describe('mat4Invert', () => {
  it('multiplies back to the identity', () => {
    expectMat(mat4Multiply(SAMPLE, mat4Invert(SAMPLE)!), mat4Identity());
    expectMat(mat4Multiply(mat4Invert(SAMPLE)!, SAMPLE), mat4Identity());
  });

  it('returns null for a singular matrix', () => {
    expect(mat4Invert(mat4Compose({ x: 0, y: 0, z: 0 }, { w: 1, x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }))).toBeNull();
  });
});

describe('mat4Compose', () => {
  it('scales, then rotates, then translates — matching quatRotate', () => {
    const q = quatMul(quatFromAxisAngle(Y, 0.7), quatFromAxisAngle(X, -0.3));
    const p = { x: 1, y: 2, z: -3 };
    const scaled = { x: p.x * 2, y: p.y * 0.5, z: p.z * 1.5 };
    const rotated = quatRotate(q, scaled);
    expectVec(mat4TransformPoint(SAMPLE, p), { x: rotated.x + 3, y: rotated.y - 2, z: rotated.z + 5 });
  });
});

describe('mat4Perspective', () => {
  it('matches the WebGL / three.js projection for known inputs', () => {
    // 90° vertical FOV, aspect 2, near 1, far 3.
    expectMat(mat4Perspective(Math.PI / 2, 2, 1, 3), [
      0.5,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      -2,
      -1,
      0,
      0,
      -3,
      0,
    ]);
  });

  it('maps the near plane to NDC z = -1 and the far plane to z = +1', () => {
    const m = mat4Perspective(1, 1.5, 0.1, 100);
    expect(mat4TransformPoint(m, { x: 0, y: 0, z: -0.1 }).z).toBeCloseTo(-1, 9);
    expect(mat4TransformPoint(m, { x: 0, y: 0, z: -100 }).z).toBeCloseTo(1, 9);
  });

  it('maps the frustum top edge to NDC y = +1', () => {
    const fovY = 1.2;
    const m = mat4Perspective(fovY, 1, 1, 10);
    const top = Math.tan(fovY / 2) * 5;
    expect(mat4TransformPoint(m, { x: 0, y: top, z: -5 }).y).toBeCloseTo(1, 9);
  });
});

describe('mat4Orthographic', () => {
  it('maps the box corners to the NDC cube corners', () => {
    const m = mat4Orthographic(-4, 2, -1, 3, 0.5, 20);
    expectVec(mat4TransformPoint(m, { x: -4, y: -1, z: -0.5 }), { x: -1, y: -1, z: -1 });
    expectVec(mat4TransformPoint(m, { x: 2, y: 3, z: -20 }), { x: 1, y: 1, z: 1 });
  });
});

describe('mat4LookAt', () => {
  it('puts the eye at the origin and the target on the -Z axis', () => {
    const eye = { x: 3, y: 4, z: 5 };
    const target = { x: -1, y: 2, z: 0 };
    const view = mat4LookAt(eye, target);
    expectVec(mat4TransformPoint(view, eye), { x: 0, y: 0, z: 0 });
    const t = mat4TransformPoint(view, target);
    expect(t.x).toBeCloseTo(0, 9);
    expect(t.y).toBeCloseTo(0, 9);
    expect(t.z).toBeCloseTo(-Math.hypot(4, 2, 5), 9);
  });

  it('keeps world up pointing up in view space', () => {
    const view = mat4LookAt({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 0 });
    expectVec(mat4TransformDirection(view, Y), Y);
  });

  it('falls back when up is parallel to the view direction, and yields identity for eye === target', () => {
    const view = mat4LookAt({ x: 0, y: 10, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(view.every(Number.isFinite)).toBe(true);
    expect(mat4TransformPoint(view, { x: 0, y: 0, z: 0 }).z).toBeCloseTo(-10, 9);
    expect(mat4LookAt(X, X)).toEqual(mat4Identity());
  });
});

describe('mat4TransformDirection and mat4TransformVec4', () => {
  it('ignores translation for directions', () => {
    const m = mat4Compose({ x: 100, y: 100, z: 100 }, { w: 1, x: 0, y: 0, z: 0 });
    expectVec(mat4TransformDirection(m, X), X);
  });

  it('returns the homogeneous result without dividing', () => {
    const m = mat4Perspective(Math.PI / 2, 1, 1, 3);
    expect(mat4TransformVec4(m, 0, 0, -2, 1)[3]).toBeCloseTo(2, 9);
  });
});
