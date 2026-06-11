import type { Vec3 } from '../game';

/** Camera forward unit vector from yaw/pitch (YXZ Euler; looks -Z at 0,0). */
export function forwardVec(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -cp * Math.sin(yaw), y: Math.sin(pitch), z: -cp * Math.cos(yaw) };
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
