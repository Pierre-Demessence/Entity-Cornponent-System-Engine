import type { Vec3 } from './game';

/** Minimal quaternion (x, y, z, w) helpers for 3-axis ship attitude. */
export interface Quat { w: number; x: number; y: number; z: number }

export const IDENTITY_QUAT: Quat = { w: 1, x: 0, y: 0, z: 0 };

/** Hamilton product a·b (apply b in a's local frame when post-multiplying). */
export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { w: q.w / len, x: q.x / len, y: q.y / len, z: q.z / len };
}

/** Rotation quaternion about a **unit** axis by `angle` radians. */
export function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return { w: Math.cos(h), x: ax * s, y: ay * s, z: az * s };
}

/** Rotate a vector by a quaternion (v + 2·qv × (qv × v + w·v)). */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + (q.y * tz - q.z * ty),
    y: v.y + q.w * ty + (q.z * tx - q.x * tz),
    z: v.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

export function quatForward(q: Quat): Vec3 {
  return quatRotate(q, { x: 0, y: 0, z: -1 });
}

export function quatUp(q: Quat): Vec3 {
  return quatRotate(q, { x: 0, y: 1, z: 0 });
}
