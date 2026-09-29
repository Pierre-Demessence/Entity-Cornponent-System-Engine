import type { Vec3 } from '../math';
import type { Camera3D, CameraPose } from './camera3d';

import { quatConjugate, quatRotate, vec3Normalize, vec3Sub } from '../math';
import { camera3DAspect } from './camera3d';

/** A world point on screen: pixels from the viewport's top-left, plus its depth. */
export interface ScreenPoint {
  /** Distance in front of the camera along its view axis, world units. */
  depth: number;
  x: number;
  y: number;
}

/** A ray in world space; `dir` is unit-length. */
export interface Ray3 {
  dir: Vec3;
  origin: Vec3;
}

// World point → camera space, where the camera looks down -Z.
function toViewSpace(p: Vec3, pose: CameraPose): Vec3 {
  return quatRotate(quatConjugate(pose.rotation), vec3Sub(p, pose.position));
}

// Half-extents of the view at `depth`: how far the screen edges reach in view space.
function halfExtentsAt(cam: Camera3D, depth: number): { h: number; w: number } {
  const aspect = camera3DAspect(cam);
  const h = cam.projection === 'orthographic' ? cam.orthoSize : Math.tan(cam.fovY / 2) * depth;
  return { h, w: h * aspect };
}

/**
 * Project the world point `p` to the screen: `x` / `y` in pixels from the
 * viewport's top-left (`y` down), `depth` along the view axis. Returns `null`
 * for a point on or behind the camera plane, which has no screen position.
 *
 * A point outside the viewport or beyond the clip planes still projects, to
 * coordinates outside `[0, viewportW] × [0, viewportH]`; test with
 * `frustumContainsPoint` when visibility is the question.
 */
export function worldToScreen(p: Vec3, cam: Camera3D, pose: CameraPose): ScreenPoint | null {
  const v = toViewSpace(p, pose);
  const depth = -v.z;
  if (depth <= 0)
    return null;
  const half = halfExtentsAt(cam, depth);
  return {
    depth,
    x: (v.x / half.w + 1) / 2 * cam.viewportW,
    y: (1 - v.y / half.h) / 2 * cam.viewportH,
  };
}

/**
 * The world point under screen pixel `(x, y)` at `depth` in front of the camera
 * — the inverse of {@link worldToScreen} (Godot `project_position`).
 */
export function screenToWorld(x: number, y: number, depth: number, cam: Camera3D, pose: CameraPose): Vec3 {
  const half = halfExtentsAt(cam, depth);
  const local = {
    x: (x / cam.viewportW * 2 - 1) * half.w,
    y: (1 - y / cam.viewportH * 2) * half.h,
    z: -depth,
  };
  const r = quatRotate(pose.rotation, local);
  return { x: r.x + pose.position.x, y: r.y + pose.position.y, z: r.z + pose.position.z };
}

/**
 * The world ray through screen pixel `(x, y)` — for picking and aiming. A
 * perspective ray starts at the camera and fans out through the pixel; an
 * orthographic ray starts on the near plane under the pixel and runs along the
 * view axis, so rays through different pixels are parallel.
 */
export function screenPointToRay(x: number, y: number, cam: Camera3D, pose: CameraPose): Ray3 {
  if (cam.projection === 'orthographic') {
    return {
      dir: quatRotate(pose.rotation, { x: 0, y: 0, z: -1 }),
      origin: screenToWorld(x, y, cam.near, cam, pose),
    };
  }
  const throughPixel = screenToWorld(x, y, 1, cam, pose);
  return {
    dir: vec3Normalize(vec3Sub(throughPixel, pose.position)),
    origin: { ...pose.position },
  };
}

/** True when `p` lies on or behind the camera plane — it cannot appear on screen. */
export function isPointBehindCamera(p: Vec3, pose: CameraPose): boolean {
  return toViewSpace(p, pose).z >= 0;
}
