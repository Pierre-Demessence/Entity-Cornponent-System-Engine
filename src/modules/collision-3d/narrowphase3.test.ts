import type { Vec3 } from '../math-3d';
import type { Aabb3, Plane3 } from './narrowphase3';

import { describe, expect, it } from 'vitest';

import {
  aabb3ContainsPoint,
  aabb3VsAabb3,
  aabb3VsAabb3Swept,
  aabb3VsPlane3,
  aabb3VsSphere3,
  plane3DistanceToPoint,
  rayVsAabb3,
  rayVsPlane3,
  sphere3ContainsPoint,
  sphere3VsPlane3,
  sphere3VsSphere3,
} from './narrowphase3';

const UNIT_BOX: Aabb3 = { center: { x: 0, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } };
const UNIT_SPHERE: Vec3 = { x: 0, y: 0, z: 0 };

const X: Vec3 = { x: 1, y: 0, z: 0 };
const Y: Vec3 = { x: 0, y: 1, z: 0 };

/** The xz plane: `y = 0`. */
const FLOOR: Plane3 = { constant: 0, normal: Y };
/** `y = 1`, so a box centred on the origin with half-height 1 rests exactly on it. */
const FLUSH: Plane3 = { constant: -1, normal: Y };

describe('rayVsAabb3', () => {
  it('reports the entry distance and the entry face', () => {
    expect(rayVsAabb3({ x: -5, y: 0, z: 0 }, X, UNIT_BOX)).toEqual({ axis: 'x', t: 4 });
    expect(rayVsAabb3({ x: 0, y: -5, z: 0 }, Y, UNIT_BOX)).toEqual({ axis: 'y', t: 4 });
    expect(rayVsAabb3({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: -1 }, UNIT_BOX)).toEqual({ axis: 'z', t: 4 });
  });

  it('misses a box it does not point at', () => {
    expect(rayVsAabb3({ x: -5, y: 2, z: 0 }, X, UNIT_BOX)).toBeNull();
  });

  it('misses a box that lies behind the origin', () => {
    expect(rayVsAabb3({ x: 5, y: 0, z: 0 }, X, UNIT_BOX)).toBeNull();
  });

  it('misses when the origin is on or inside the box', () => {
    expect(rayVsAabb3({ x: 0, y: 0, z: 0 }, X, UNIT_BOX)).toBeNull();
    expect(rayVsAabb3({ x: 1, y: 0, z: 0 }, X, UNIT_BOX)).toBeNull();
  });

  it('misses a parallel ray outside the other two slabs', () => {
    expect(rayVsAabb3({ x: -5, y: 0, z: 5 }, X, UNIT_BOX)).toBeNull();
  });

  it('measures t in units of dir, so a segment is a t <= 1 test', () => {
    // Half the distance covered per unit of dir, so twice the t.
    expect(rayVsAabb3({ x: -5, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, UNIT_BOX)?.t).toBe(2);
    const hit = rayVsAabb3({ x: -5, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }, UNIT_BOX);
    expect(hit!.t <= 1).toBe(true);
  });

  it('hits a corner once, on the earlier axis', () => {
    const hit = rayVsAabb3({ x: -5, y: -5, z: 0 }, { x: 1, y: 1, z: 0 }, UNIT_BOX);
    // Both x and y entry at t = 4 / 1 per axis, and x is tested first.
    expect(hit).toEqual({ axis: 'x', t: 4 });
  });
});

describe('aabb3VsAabb3', () => {
  it('overlaps on every axis', () => {
    const other: Aabb3 = { center: { x: 1.5, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } };
    expect(aabb3VsAabb3(UNIT_BOX, other)).toBe(true);
  });

  it('does not overlap when one axis is separated', () => {
    const other: Aabb3 = { center: { x: 3, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } };
    expect(aabb3VsAabb3(UNIT_BOX, other)).toBe(false);
  });

  it('does not count edge-contact as overlap', () => {
    const flush: Aabb3 = { center: { x: 2, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } };
    expect(aabb3VsAabb3(UNIT_BOX, flush)).toBe(false);
  });

  it('counts a fully contained box', () => {
    const inner: Aabb3 = { center: { x: 0.5, y: 0.5, z: 0.5 }, half: { x: 0.25, y: 0.25, z: 0.25 } };
    expect(aabb3VsAabb3(UNIT_BOX, inner)).toBe(true);
  });

  it('is symmetric', () => {
    const far: Aabb3 = { center: { x: 9, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } };
    expect(aabb3VsAabb3(UNIT_BOX, far)).toBe(aabb3VsAabb3(far, UNIT_BOX));
  });
});

describe('aabb3ContainsPoint', () => {
  it('accepts the centre and the boundary, rejects just outside', () => {
    expect(aabb3ContainsPoint(UNIT_BOX, { x: 0, y: 0, z: 0 })).toBe(true);
    expect(aabb3ContainsPoint(UNIT_BOX, { x: 1, y: -1, z: 1 })).toBe(true);
    expect(aabb3ContainsPoint(UNIT_BOX, { x: 1.000_1, y: 0, z: 0 })).toBe(false);
  });
});

describe('aabb3VsSphere3', () => {
  it('counts a sphere touching a face', () => {
    expect(aabb3VsSphere3(UNIT_BOX, { x: 2, y: 0, z: 0 }, 1)).toBe(true);
  });

  it('rejects a sphere that falls just short', () => {
    expect(aabb3VsSphere3(UNIT_BOX, { x: 2, y: 0, z: 0 }, 0.999)).toBe(false);
  });

  it('catches a sphere overlapping a corner', () => {
    // Corner at (1,1,1); a sphere centred beyond it still overlaps if it reaches.
    const corner: Vec3 = { x: 1.5, y: 1.5, z: 1.5 };
    expect(aabb3VsSphere3(UNIT_BOX, corner, 1)).toBe(true);
  });

  it('overlaps a sphere centred inside the box', () => {
    expect(aabb3VsSphere3(UNIT_BOX, { x: 0.5, y: 0, z: 0 }, 0.1)).toBe(true);
  });

  it('never overlaps a zero-radius sphere that is outside', () => {
    expect(aabb3VsSphere3(UNIT_BOX, { x: 2, y: 0, z: 0 }, 0)).toBe(false);
  });
});

describe('sphere3VsSphere3', () => {
  it('counts touching spheres', () => {
    expect(sphere3VsSphere3(UNIT_SPHERE, 1, { x: 3, y: 0, z: 0 }, 2)).toBe(true);
  });

  it('rejects a hair further apart', () => {
    expect(sphere3VsSphere3(UNIT_SPHERE, 1, { x: 3.001, y: 0, z: 0 }, 2)).toBe(false);
  });

  it('counts identical centres', () => {
    expect(sphere3VsSphere3(UNIT_SPHERE, 0.5, UNIT_SPHERE, 0.5)).toBe(true);
  });
});

describe('sphere3ContainsPoint', () => {
  it('accepts the surface and rejects just outside', () => {
    expect(sphere3ContainsPoint(UNIT_SPHERE, 2, { x: 0, y: 2, z: 0 })).toBe(true);
    expect(sphere3ContainsPoint(UNIT_SPHERE, 2, { x: 0, y: 2.001, z: 0 })).toBe(false);
  });

  it('holds only its centre when the radius is zero', () => {
    expect(sphere3ContainsPoint(UNIT_SPHERE, 0, UNIT_SPHERE)).toBe(true);
    expect(sphere3ContainsPoint(UNIT_SPHERE, 0, { x: 0.001, y: 0, z: 0 })).toBe(false);
  });
});

describe('plane3DistanceToPoint', () => {
  it('is signed, and zero on the plane', () => {
    expect(plane3DistanceToPoint(FLOOR, { x: 7, y: 3, z: -2 })).toBe(3);
    expect(plane3DistanceToPoint(FLOOR, { x: 0, y: -2, z: 0 })).toBe(-2);
    expect(plane3DistanceToPoint(FLOOR, { x: 5, y: 0, z: 5 })).toBe(0);
  });
});

describe('rayVsPlane3', () => {
  it('returns the t at which the ray meets the plane', () => {
    expect(rayVsPlane3({ x: 0, y: -5, z: 0 }, Y, FLOOR)).toBe(5);
  });

  it('returns zero when the origin is already on the plane, not a negative zero', () => {
    const t = rayVsPlane3({ x: 0, y: 0, z: 0 }, Y, FLOOR);
    expect(t).toBe(0);
    expect(Object.is(t, -0)).toBe(false);
  });

  it('misses a plane behind the origin', () => {
    expect(rayVsPlane3({ x: 0, y: 5, z: 0 }, Y, FLOOR)).toBeNull();
  });

  it('misses a parallel ray', () => {
    expect(rayVsPlane3({ x: 0, y: 5, z: 0 }, X, FLOOR)).toBeNull();
  });
});

describe('aabb3VsPlane3', () => {
  it('is true when the plane crosses the box', () => {
    expect(aabb3VsPlane3(UNIT_BOX, FLOOR)).toBe(true);
  });

  it('counts a box resting exactly on the plane', () => {
    expect(aabb3VsPlane3(UNIT_BOX, FLUSH)).toBe(true);
  });

  it('is false when the whole box sits clear of the plane', () => {
    expect(aabb3VsPlane3(UNIT_BOX, { constant: -1.5, normal: Y })).toBe(false);
  });
});

describe('sphere3VsPlane3', () => {
  it('counts a sphere whose surface just reaches the plane', () => {
    expect(sphere3VsPlane3({ x: 0, y: 1.5, z: 0 }, 1.5, FLOOR)).toBe(true);
    expect(sphere3VsPlane3({ x: 0, y: 1.5, z: 0 }, 1.4, FLOOR)).toBe(false);
  });
});

describe('aabb3VsAabb3Swept', () => {
  const moving: Aabb3 = { center: { x: -5, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } };

  it('stops part-way when it would reach the other box', () => {
    // The moving box spans x ∈ [-6, -4] and the unit box [-1, 1], so they touch
    // once 3 of the 8 units of motion are spent.
    const hit = aabb3VsAabb3Swept(moving, { x: 8, y: 0, z: 0 }, UNIT_BOX);
    expect(hit.hit).toBe(true);
    expect(hit.tEntry).toBeCloseTo(0.375, 12);
    expect(hit.normal).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('reports a miss when the motion falls short', () => {
    // 3 units of motion is exactly enough, so anything less must miss.
    expect(aabb3VsAabb3Swept(moving, { x: 2.9, y: 0, z: 0 }, UNIT_BOX).hit).toBe(false);
  });

  it('reports a miss when moving away', () => {
    expect(aabb3VsAabb3Swept(moving, { x: -8, y: 0, z: 0 }, UNIT_BOX).hit).toBe(false);
  });

  it('reports a miss for a pair that already overlaps', () => {
    const overlapping: Aabb3 = { center: { x: -1, y: 0, z: 0 }, half: { x: 1, y: 1, z: 1 } };
    expect(aabb3VsAabb3Swept(overlapping, { x: 4, y: 0, z: 0 }, UNIT_BOX).hit).toBe(false);
  });

  it('reports a miss for zero motion, and lets a still axis constrain nothing', () => {
    expect(aabb3VsAabb3Swept(moving, { x: 0, y: 0, z: 0 }, UNIT_BOX).hit).toBe(false);
    // No motion on y or z, but the projections already overlap there, so x
    // decides: contact after 3 of the 4 units.
    const hit = aabb3VsAabb3Swept(moving, { x: 4, y: 0, z: 0 }, UNIT_BOX);
    expect(hit.hit).toBe(true);
    expect(hit.tEntry).toBeCloseTo(0.75, 12);
  });

  it('takes the corner tie to the later axis', () => {
    const diagonal: Aabb3 = { center: { x: -5, y: -5, z: 0 }, half: { x: 1, y: 1, z: 1 } };
    const hit = aabb3VsAabb3Swept(diagonal, { x: 4, y: 4, z: 0 }, UNIT_BOX);
    expect(hit.tEntry).toBeCloseTo(0.75, 12);
    expect(hit.normal.y).toBe(-1);
  });
});
