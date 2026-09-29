import type { Vec3 } from '#modules/math/index';

import { describe, expect, it } from 'vitest';

import { quatForward, quatFromAxisAngle } from '#modules/math/index';

import { makeCamera3D } from './camera3d';
import { isPointBehindCamera, screenPointToRay, screenToWorld, worldToScreen } from './project';

const POSE = {
  position: { x: 4, y: 2, z: -3 },
  rotation: quatFromAxisAngle({ x: 1, y: 2, z: 0.5 }, 0.9),
};
const IDENTITY_POSE = { position: { x: 0, y: 0, z: 0 }, rotation: { w: 1, x: 0, y: 0, z: 0 } };
const PERSPECTIVE = makeCamera3D({ fovY: 1.1, viewportH: 600, viewportW: 800 });
const ORTHO = makeCamera3D({ orthoSize: 3, projection: 'orthographic', viewportH: 600, viewportW: 800 });

function expectVec(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
}

describe('worldToScreen and screenToWorld', () => {
  for (const cam of [PERSPECTIVE, ORTHO]) {
    it(`round-trip at several depths (${cam.projection})`, () => {
      for (const [x, y, depth] of [[0, 0, 1], [400, 300, 5], [790, 20, 40], [-50, 700, 0.5]] as const) {
        const world = screenToWorld(x, y, depth, cam, POSE);
        const screen = worldToScreen(world, cam, POSE)!;
        expect(screen.x).toBeCloseTo(x, 6);
        expect(screen.y).toBeCloseTo(y, 6);
        expect(screen.depth).toBeCloseTo(depth, 9);
      }
    });
  }

  it('puts the screen centre on the forward axis', () => {
    const f = quatForward(POSE.rotation);
    expectVec(screenToWorld(400, 300, 7, PERSPECTIVE, POSE), {
      x: POSE.position.x + f.x * 7,
      y: POSE.position.y + f.y * 7,
      z: POSE.position.z + f.z * 7,
    });
  });

  it('puts the top screen edge at half the field of view, with y growing downward', () => {
    expect(screenToWorld(400, 0, 2, PERSPECTIVE, IDENTITY_POSE).y).toBeCloseTo(Math.tan(1.1 / 2) * 2, 9);
    expect(worldToScreen({ x: 0, y: -1, z: -2 }, PERSPECTIVE, IDENTITY_POSE)!.y).toBeGreaterThan(300);
  });

  it('returns null for a point on or behind the camera plane', () => {
    expect(worldToScreen({ x: 0, y: 0, z: 1 }, PERSPECTIVE, IDENTITY_POSE)).toBeNull();
    expect(worldToScreen({ x: 1, y: 0, z: 0 }, PERSPECTIVE, IDENTITY_POSE)).toBeNull();
  });
});

describe('screenPointToRay', () => {
  it('casts the centre ray from the camera along its forward axis (perspective)', () => {
    const ray = screenPointToRay(400, 300, PERSPECTIVE, POSE);
    expectVec(ray.origin, POSE.position);
    expectVec(ray.dir, quatForward(POSE.rotation));
  });

  it('passes through the point the pixel shows', () => {
    const ray = screenPointToRay(120, 510, PERSPECTIVE, POSE);
    const p = screenToWorld(120, 510, 9, PERSPECTIVE, POSE);
    const toP = { x: p.x - ray.origin.x, y: p.y - ray.origin.y, z: p.z - ray.origin.z };
    const len = Math.hypot(toP.x, toP.y, toP.z);
    expectVec(ray.dir, { x: toP.x / len, y: toP.y / len, z: toP.z / len });
  });

  it('casts parallel rays from the near plane (orthographic)', () => {
    const a = screenPointToRay(0, 0, ORTHO, POSE);
    const b = screenPointToRay(800, 600, ORTHO, POSE);
    expectVec(a.dir, quatForward(POSE.rotation));
    expectVec(b.dir, a.dir);
    expect(worldToScreen(a.origin, ORTHO, POSE)!.depth).toBeCloseTo(ORTHO.near, 9);
    expect(a.origin).not.toEqual(b.origin);
  });
});

describe('isPointBehindCamera', () => {
  it('splits space at the camera plane', () => {
    const f = quatForward(POSE.rotation);
    const ahead = { x: POSE.position.x + f.x, y: POSE.position.y + f.y, z: POSE.position.z + f.z };
    const behind = { x: POSE.position.x - f.x, y: POSE.position.y - f.y, z: POSE.position.z - f.z };
    expect(isPointBehindCamera(ahead, POSE)).toBe(false);
    expect(isPointBehindCamera(behind, POSE)).toBe(true);
  });
});
