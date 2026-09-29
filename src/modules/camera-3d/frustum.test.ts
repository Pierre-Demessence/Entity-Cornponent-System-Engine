import type { Vec3 } from '#modules/math/index';

import { describe, expect, it } from 'vitest';

import { plane3DistanceToPoint } from '#modules/collision-3d/index';
import { quatFromAxisAngle } from '#modules/math/index';

import { makeCamera3D } from './camera3d';
import {
  camera3DFrustum,
  frustumContainsPoint,
  frustumCorners,
  frustumIntersectsAabb,
  frustumIntersectsSphere,
} from './frustum';
import { screenToWorld, worldToScreen } from './project';

const POSE = {
  position: { x: 4, y: 2, z: -3 },
  rotation: quatFromAxisAngle({ x: 1, y: 2, z: 0.5 }, 0.9),
};
const EPS = 1e-4;

for (const cam of [
  makeCamera3D({ far: 50, fovY: 1.1, near: 0.5, viewportH: 600, viewportW: 800 }),
  makeCamera3D({ far: 50, near: 0.5, orthoSize: 3, projection: 'orthographic', viewportH: 600, viewportW: 800 }),
]) {
  describe(`camera3DFrustum (${cam.projection})`, () => {
    const frustum = camera3DFrustum(cam, POSE);
    const at = (x: number, y: number, depth: number): Vec3 => screenToWorld(x, y, depth, cam, POSE);
    // One point just inside and one just outside each plane, in stored plane order.
    const probes = [
      { inside: at(1, 300, 10), outside: at(-1, 300, 10), plane: 'left' },
      { inside: at(799, 300, 10), outside: at(801, 300, 10), plane: 'right' },
      { inside: at(400, 599, 10), outside: at(400, 601, 10), plane: 'bottom' },
      { inside: at(400, 1, 10), outside: at(400, -1, 10), plane: 'top' },
      { inside: at(400, 300, 0.5 + EPS), outside: at(400, 300, 0.5 - EPS), plane: 'near' },
      { inside: at(400, 300, 50 - EPS), outside: at(400, 300, 50 + EPS), plane: 'far' },
    ];

    it('has unit, inward-facing normals', () => {
      for (const plane of frustum)
        expect(Math.hypot(plane.normal.x, plane.normal.y, plane.normal.z)).toBeCloseTo(1, 9);
      expect(frustumContainsPoint(frustum, at(400, 300, 10))).toBe(true);
    });

    for (const [index, probe] of probes.entries()) {
      it(`stores the ${probe.plane} plane at index ${index} and separates points across it`, () => {
        expect(frustumContainsPoint(frustum, probe.inside)).toBe(true);
        expect(frustumContainsPoint(frustum, probe.outside)).toBe(false);
        expect(plane3DistanceToPoint(frustum[index]!, probe.inside)).toBeGreaterThan(0);
        expect(plane3DistanceToPoint(frustum[index]!, probe.outside)).toBeLessThan(0);
      });

      it(`keeps a small sphere and box that reach back across the ${probe.plane} plane`, () => {
        expect(frustumIntersectsSphere(frustum, probe.outside, 0.1)).toBe(true);
        expect(frustumIntersectsAabb(frustum, { center: probe.outside, half: { x: 0.1, y: 0.1, z: 0.1 } })).toBe(true);
      });
    }

    it('rejects a sphere and a box wholly behind the camera', () => {
      const behind = at(400, 300, -20);
      expect(frustumIntersectsSphere(frustum, behind, 1)).toBe(false);
      expect(frustumIntersectsAabb(frustum, { center: behind, half: { x: 1, y: 1, z: 1 } })).toBe(false);
    });

    it('accepts a box that straddles a plane', () => {
      expect(frustumIntersectsAabb(frustum, { center: at(0, 300, 10), half: { x: 0.5, y: 0.5, z: 0.5 } })).toBe(true);
    });

    it('lists the eight corners near-then-far, clockwise from top-left', () => {
      const corners = frustumCorners(cam, POSE);
      expect(corners).toHaveLength(8);
      const expected = [[0, 0], [800, 0], [800, 600], [0, 600]] as const;
      corners.forEach((c, i) => {
        const s = worldToScreen(c, cam, POSE)!;
        expect(s.x).toBeCloseTo(expected[i % 4]![0], 6);
        expect(s.y).toBeCloseTo(expected[i % 4]![1], 6);
        expect(s.depth).toBeCloseTo(i < 4 ? 0.5 : 50, 6);
      });
    });
  });
}
