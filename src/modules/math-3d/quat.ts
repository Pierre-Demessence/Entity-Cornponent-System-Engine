import type { Vec3 } from './vec3';

import { vec3Length } from './vec3';

/**
 * Rotation primitives for 3-axis attitude — the `Quat` half of this module.
 * Pure functions over a plain `{w, x, y, z}` object, scalar part first in the
 * layout as well as in the name. The libraries this follows all spell their
 * constructor `(x, y, z, w)`, so transcribe carefully on the way in.
 *
 * **Depends on nothing** beyond this module's own `vec3` helpers.
 */

/** A rotation quaternion: scalar part `w` plus vector part `(x, y, z)`. */
export interface Quat { w: number; x: number; y: number; z: number }

/**
 * The identity rotation. Frozen: it is shared, so a consumer that wants to
 * modify a quaternion must copy it first (every function here returns a new
 * value, so the usual path never needs to).
 */
export const QUAT_IDENTITY: Quat = Object.freeze({ w: 1, x: 0, y: 0, z: 0 });

/**
 * The direction the local `-Z` axis points after applying `q` — the "forward"
 * of the right-handed convention (three.js, Bevy, Godot). Unity is left-handed
 * with a `+Z` forward, so a port to it needs a handedness mirror, not merely a
 * negated result.
 */
export function quatForward(q: Quat): Vec3 {
  return quatRotate(q, { x: 0, y: 0, z: -1 });
}

/**
 * Rotation of `angle` radians about `axis`, right-handed: curl the fingers of
 * your right hand around the axis and the thumb points along the rotation.
 *
 * The axis is normalised for you, so a non-unit axis is fine. A zero-length
 * axis has no direction to rotate about, so it yields the identity.
 */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const mag = vec3Length(axis);
  if (mag === 0)
    return { w: 1, x: 0, y: 0, z: 0 };
  const s = Math.sin(angle / 2) / mag;
  return { w: Math.cos(angle / 2), x: axis.x * s, y: axis.y * s, z: axis.z * s };
}

/**
 * Hamilton product `a·b`: the rotation that applies `b` **first**, then `a`.
 * Composing with `quatMul` is how angular velocity is integrated into an
 * orientation, and why the order matters.
 */
export function quatMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/**
 * Unit-length copy of `q`. A zero-length input returns the identity rather than
 * `NaN`: a zero quaternion is not a rotation, and three.js resolves the same
 * degenerate case the same way.
 */
export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q.w, q.x, q.y, q.z);
  if (len === 0)
    return { w: 1, x: 0, y: 0, z: 0 };
  return { w: q.w / len, x: q.x / len, y: q.y / len, z: q.z / len };
}

/**
 * Rotate `v` by the **unit** quaternion `q`. A non-unit `q` scales the result
 * instead of rotating it, so normalise — or compose only unit quaternions with
 * `quatMul`, which keeps them unit.
 */
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

/** The direction the local `+Y` axis points after applying `q`. */
export function quatUp(q: Quat): Vec3 {
  return quatRotate(q, { x: 0, y: 1, z: 0 });
}
