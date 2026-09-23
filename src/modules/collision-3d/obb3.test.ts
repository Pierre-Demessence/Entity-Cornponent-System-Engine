import type { Quat, Vec3 } from '../math-3d';
import type { Aabb3 } from './narrowphase3';
import type { Obb3 } from './obb3';

import { describe, expect, it } from 'vitest';

import { quatFromAxisAngle } from '../math-3d';
import { aabb3VsAabb3 } from './narrowphase3';
import { aabb3VsObb3, obb3VsObb3, obb3VsSphere3, rayVsObb3 } from './obb3';

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const X: Vec3 = { x: 1, y: 0, z: 0 };
const Z: Vec3 = { x: 0, y: 0, z: 1 };

const IDENTITY: Quat = quatFromAxisAngle(X, 0);
/** A cube's orientation does not matter: half extents are equal on all axes. */
const CUBE: Obb3 = { center: ORIGIN, half: { x: 1, y: 1, z: 1 }, rotation: IDENTITY };
/** A box that is long on y, so a rotation about x visibly moves its reach. */
const LONG: Obb3 = { center: ORIGIN, half: { x: 1, y: 3, z: 1 }, rotation: IDENTITY };
const LONG_TILTED: Obb3 = { ...LONG, rotation: quatFromAxisAngle(X, Math.PI / 2) };
/** A cube rotated 45° about z reaches √2 along x instead of 1. */
const DIAMOND: Obb3 = { center: { x: 0, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 }, rotation: quatFromAxisAngle(Z, Math.PI / 4) };

function asObb(box: Aabb3): Obb3 {
  return { center: box.center, half: box.half, rotation: IDENTITY };
}

describe('obb3VsObb3', () => {
  it('agrees with the axis-aligned test when neither box is rotated', () => {
    const cases: Array<[Aabb3, Aabb3]> = [
      [{ center: ORIGIN, half: { x: 1, y: 1, z: 1 } }, { center: { x: 1.5, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } }],
      [{ center: ORIGIN, half: { x: 1, y: 1, z: 1 } }, { center: { x: 3, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } }],
      [{ center: ORIGIN, half: { x: 1, y: 1, z: 1 } }, { center: { x: 2, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } }],
    ];
    for (const [a, b] of cases)
      expect(obb3VsObb3(asObb(a), asObb(b))).toBe(aabb3VsAabb3(a, b));
  });

  it('counts a rotated box that reaches further than its axis-aligned frame implies', () => {
    const touching: Obb3 = { ...DIAMOND, center: { x: 2.4, y: 0, z: 0 } };
    const apart: Obb3 = { ...DIAMOND, center: { x: 2.5, y: 0, z: 0 } };
    expect(obb3VsObb3(CUBE, touching)).toBe(true);
    expect(obb3VsObb3(CUBE, apart)).toBe(false);
  });

  it('does not count a face-to-face touch', () => {
    const flush: Obb3 = { ...CUBE, center: { x: 2, y: 0, z: 0 } };
    expect(obb3VsObb3(CUBE, flush)).toBe(false);
  });

  it('is symmetric', () => {
    const near: Obb3 = { ...DIAMOND, center: { x: 2.4, y: 0, z: 0 } };
    const far: Obb3 = { ...DIAMOND, center: { x: 9, y: 0, z: 0 } };
    expect(obb3VsObb3(CUBE, near)).toBe(obb3VsObb3(near, CUBE));
    expect(obb3VsObb3(CUBE, far)).toBe(obb3VsObb3(far, CUBE));
  });

  it('stays truthful when two axes are near-parallel', () => {
    // A tiny relative rotation makes the cross-product axes degenerate.
    const tick: Obb3 = { ...CUBE, center: { x: 9, y: 0, z: 0 }, rotation: quatFromAxisAngle(Z, 1e-12) };
    expect(obb3VsObb3(CUBE, tick)).toBe(false);
  });

  it('handles a zero-size box as a point', () => {
    const point: Obb3 = { center: { x: 2, y: 0, z: 0 }, half: ORIGIN, rotation: IDENTITY };
    expect(obb3VsObb3(CUBE, point)).toBe(false);
    expect(obb3VsObb3(CUBE, { ...point, center: { x: 0.5, y: 0, z: 0 } })).toBe(true);
    // A point sitting exactly on the face is edge contact, which does not count
    // here — `aabb3ContainsPoint` is the inclusive query.
    expect(obb3VsObb3(CUBE, { ...point, center: { x: 1, y: 0, z: 0 } })).toBe(false);
  });
});

describe('aabb3VsObb3', () => {
  it('matches the OBB path for an unrotated pair', () => {
    const box: Aabb3 = { center: { x: 1.5, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } };
    expect(aabb3VsObb3(box, CUBE)).toBe(obb3VsObb3(asObb(box), CUBE));
    expect(aabb3VsObb3(box, CUBE)).toBe(true);
  });

  it('reaches a rotated box that an axis-aligned test would miss', () => {
    const probe: Aabb3 = { center: { x: 1.2, y: 0, z: 0 }, half: { x: 0.05, y: 0.05, z: 0.05 } };
    expect(aabb3VsObb3(probe, DIAMOND)).toBe(true);
  });
});

describe('obb3VsSphere3', () => {
  it('reaches along the box\'s own long axis when it is rotated', () => {
    const farAlongZ: Vec3 = { x: 0, y: 0, z: 3.5 };
    expect(obb3VsSphere3(LONG, farAlongZ, 0.6)).toBe(false);
    expect(obb3VsSphere3(LONG_TILTED, farAlongZ, 0.6)).toBe(true);
  });

  it('is unaffected by a rotation that is a symmetry of the box', () => {
    const nearCorner: Vec3 = { x: 1.5, y: 1.5, z: 1.5 };
    expect(obb3VsSphere3(CUBE, nearCorner, 1)).toBe(true);
    // A quarter turn about z is a cube symmetry, so the reach is identical.
    expect(obb3VsSphere3({ ...CUBE, rotation: quatFromAxisAngle(Z, Math.PI / 2) }, nearCorner, 1)).toBe(true);
  });

  it('loses the corner reach when the cube is turned 45°', () => {
    const nearCorner: Vec3 = { x: 1.5, y: 1.5, z: 1.5 };
    const midTurn: Obb3 = { ...CUBE, rotation: quatFromAxisAngle(Z, Math.PI / 4) };
    // The point projects to (2.12, 0, 1.5) in the box's frame, so its nearest
    // point is (1, 0, 1) — 1.23 away, past the sphere's reach.
    expect(obb3VsSphere3(midTurn, nearCorner, 1)).toBe(false);
  });

  it('counts a sphere centred inside the box', () => {
    expect(obb3VsSphere3(LONG, ORIGIN, 0.01)).toBe(true);
  });
});

describe('rayVsObb3', () => {
  it('names the box\'s local axes when there is no rotation', () => {
    expect(rayVsObb3({ x: -5, y: 0, z: 0 }, X, CUBE)).toEqual({ axis: 'x', t: 4 });
  });

  it('follows the box\'s long axis when it is rotated', () => {
    expect(rayVsObb3({ x: 0, y: 0, z: -5 }, Z, LONG)?.t).toBe(4);
    expect(rayVsObb3({ x: 0, y: 0, z: -5 }, Z, LONG_TILTED)?.t).toBe(2);
  });

  it('misses, is behind, and is inside by the same rules as the axis-aligned test', () => {
    expect(rayVsObb3({ x: -5, y: 2, z: 0 }, X, CUBE)).toBeNull();
    expect(rayVsObb3({ x: 5, y: 0, z: 0 }, X, CUBE)).toBeNull();
    expect(rayVsObb3(ORIGIN, X, CUBE)).toBeNull();
  });
});
