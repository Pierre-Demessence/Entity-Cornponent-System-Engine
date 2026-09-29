import type { Aabb3, Plane3 } from '../collision-3d';
import type { Mat4, Vec3 } from '../math';
import type { Camera3D, CameraPose } from './camera3d';

import { plane3DistanceToPoint } from '../collision-3d';
import { camera3DViewProjection } from './camera3d';
import { screenToWorld } from './project';

/**
 * The six planes bounding what a camera sees, in the order left, right, bottom,
 * top, near, far. Every normal is unit-length and points **inward**, so a point
 * is inside when its distance to every plane is `>= 0`.
 */
export type Frustum = readonly [Plane3, Plane3, Plane3, Plane3, Plane3, Plane3];

/**
 * Extract the frustum from a view-projection matrix (Gribb–Hartmann): each plane
 * is the matrix's fourth row plus or minus one of the others. Works for any
 * WebGL-convention projection, perspective or orthographic.
 */
export function frustumFromMatrix(viewProjection: Mat4): Frustum {
  const m = viewProjection;
  const row = (i: number): [number, number, number, number] => [m[i]!, m[4 + i]!, m[8 + i]!, m[12 + i]!];
  const w = row(3);
  const plane = (r: [number, number, number, number], sign: 1 | -1): Plane3 => {
    const a = w[0] + sign * r[0];
    const b = w[1] + sign * r[1];
    const c = w[2] + sign * r[2];
    const len = Math.hypot(a, b, c);
    return { constant: (w[3] + sign * r[3]) / len, normal: { x: a / len, y: b / len, z: c / len } };
  };
  return [
    plane(row(0), 1),
    plane(row(0), -1),
    plane(row(1), 1),
    plane(row(1), -1),
    plane(row(2), 1),
    plane(row(2), -1),
  ];
}

/** The frustum of `cam` standing at `pose`. */
export function camera3DFrustum(cam: Camera3D, pose: CameraPose): Frustum {
  return frustumFromMatrix(camera3DViewProjection(cam, pose));
}

/** True when `p` is inside the frustum or on its boundary. */
export function frustumContainsPoint(frustum: Frustum, p: Vec3): boolean {
  return frustum.every(plane => plane3DistanceToPoint(plane, p) >= 0);
}

/**
 * True unless the sphere lies wholly outside one of the planes. Conservative:
 * a sphere just beyond a frustum corner can report `true` — the usual trade for
 * a six-test cull, and safe, since it only ever keeps too much.
 */
export function frustumIntersectsSphere(frustum: Frustum, center: Vec3, radius: number): boolean {
  return frustum.every(plane => plane3DistanceToPoint(plane, center) >= -radius);
}

/** True unless the box lies wholly outside one of the planes. Conservative, like {@link frustumIntersectsSphere}. */
export function frustumIntersectsAabb(frustum: Frustum, box: Aabb3): boolean {
  return frustum.every((plane) => {
    const reach = box.half.x * Math.abs(plane.normal.x)
      + box.half.y * Math.abs(plane.normal.y)
      + box.half.z * Math.abs(plane.normal.z);
    return plane3DistanceToPoint(plane, box.center) >= -reach;
  });
}

/**
 * The eight world-space corners of the view volume: the near plane's
 * top-left, top-right, bottom-right, bottom-left, then the far plane's in the
 * same order.
 */
export function frustumCorners(cam: Camera3D, pose: CameraPose): Vec3[] {
  const screen: [number, number][] = [[0, 0], [cam.viewportW, 0], [cam.viewportW, cam.viewportH], [0, cam.viewportH]];
  return [cam.near, cam.far].flatMap(depth => screen.map(([x, y]) => screenToWorld(x, y, depth, cam, pose)));
}
