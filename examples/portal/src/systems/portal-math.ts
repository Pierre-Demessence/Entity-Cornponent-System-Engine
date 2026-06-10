import type { Portal, Vec3 } from '../game';

import { PORTAL_H, PORTAL_W } from '../game';

/** Camera forward unit vector from yaw/pitch (YXZ Euler; looks -Z at 0,0). */
export function forwardVec(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -cp * Math.sin(yaw), y: Math.sin(pitch), z: -cp * Math.cos(yaw) };
}

/** World point → portal-local coords (right, up, normal) relative to centre. */
export function localCoords(p: Vec3, portal: Portal): Vec3 {
  const dx = p.x - portal.center.x;
  const dy = p.y - portal.center.y;
  const dz = p.z - portal.center.z;
  return {
    x: dx * portal.right.x + dy * portal.right.y + dz * portal.right.z,
    y: dx * portal.up.x + dy * portal.up.y + dz * portal.up.z,
    z: dx * portal.normal.x + dy * portal.normal.y + dz * portal.normal.z,
  };
}

/** True if portal-local coords fall within the (optionally padded) opening. */
export function withinOpening(local: Vec3, padX = 0, padY = 0): boolean {
  return Math.abs(local.x) <= PORTAL_W / 2 + padX && Math.abs(local.y) <= PORTAL_H / 2 + padY;
}

/**
 * Map a world point through the portal pair (`src` → `dst`). The destination
 * frame is rotated 180° about its up axis, so a body entering the front of
 * `src` emerges from the front of `dst`.
 */
export function transformPoint(p: Vec3, src: Portal, dst: Portal): Vec3 {
  const l = localCoords(p, src);
  return {
    x: dst.center.x - l.x * dst.right.x + l.y * dst.up.x - l.z * dst.normal.x,
    y: dst.center.y - l.x * dst.right.y + l.y * dst.up.y - l.z * dst.normal.y,
    z: dst.center.z - l.x * dst.right.z + l.y * dst.up.z - l.z * dst.normal.z,
  };
}

/** Map a world direction/velocity through the portal pair (no translation). */
export function transformVec(v: Vec3, src: Portal, dst: Portal): Vec3 {
  const lx = v.x * src.right.x + v.y * src.right.y + v.z * src.right.z;
  const ly = v.x * src.up.x + v.y * src.up.y + v.z * src.up.z;
  const lz = v.x * src.normal.x + v.y * src.normal.y + v.z * src.normal.z;
  return {
    x: -lx * dst.right.x + ly * dst.up.x - lz * dst.normal.x,
    y: -lx * dst.right.y + ly * dst.up.y - lz * dst.normal.y,
    z: -lx * dst.right.z + ly * dst.up.z - lz * dst.normal.z,
  };
}

export interface RayHit { axis: 'x' | 'y' | 'z'; t: number }

const RAY_AXES = ['x', 'y', 'z'] as const;

/**
 * Ray vs center-based AABB (slab method). Returns the entry distance `t` (> 0)
 * and the axis of the entry face, or null if the ray misses or starts
 * inside/behind the box. `d` is assumed unit-length so `t` is a world distance.
 */
export function rayAabb(o: Vec3, d: Vec3, center: Vec3, half: Vec3): RayHit | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis: 'x' | 'y' | 'z' = 'x';
  for (const a of RAY_AXES) {
    const lo = center[a] - half[a];
    const hi = center[a] + half[a];
    if (Math.abs(d[a]) < 1e-8) {
      if (o[a] < lo || o[a] > hi)
        return null;
      continue;
    }
    let t1 = (lo - o[a]) / d[a];
    let t2 = (hi - o[a]) / d[a];
    if (t1 > t2)
      [t1, t2] = [t2, t1];
    if (t1 > tmin) {
      tmin = t1;
      axis = a;
    }
    if (t2 < tmax)
      tmax = t2;
    if (tmin > tmax)
      return null;
  }
  if (tmin <= 1e-4)
    return null;
  return { axis, t: tmin };
}
