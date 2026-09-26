/** A plain 2D vector value object. */
export interface Vec2 { x: number; y: number }

/**
 * Unit vector pointing the same direction as `v`. A zero-length input has no
 * direction, so it returns `{ x: 0, y: 0 }` rather than `NaN` — a caller that
 * wants a fallback direction must supply it. Sibling of `vec3Normalize`.
 */
export function vec2Normalize(v: Vec2): Vec2 {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0)
    return { x: 0, y: 0 };
  return { x: v.x / mag, y: v.y / mag };
}

/**
 * `v` rescaled so its length equals `length`, direction preserved — the
 * canonical "normalize then multiply" for driving a body at a fixed speed from
 * an arbitrary direction (input axis, steering delta, reflected velocity). A
 * zero-length input returns `{ x: 0, y: 0 }`. Sibling of `vec3ScaleToLength`.
 */
export function vec2ScaleToLength(v: Vec2, length: number): Vec2 {
  const mag = Math.hypot(v.x, v.y);
  if (mag === 0)
    return { x: 0, y: 0 };
  const k = length / mag;
  return { x: v.x * k, y: v.y * k };
}

/**
 * `current` stepped `delta` units along the straight line to `target`;
 * sibling of `vec3MoveToward`. A forward mover
 * cannot overshoot: once the remaining distance is within `delta` the target
 * itself is returned, so repeated calls settle on it instead of oscillating
 * around it.
 *
 * `delta` is a *signed* step: a negative one walks
 * away from the target, and `0` leaves the position unchanged.
 */
export function vec2MoveToward(current: Vec2, target: Vec2, delta: number): Vec2 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || dist <= delta)
    return { x: target.x, y: target.y };
  const k = delta / dist;
  return { x: current.x + dx * k, y: current.y + dy * k };
}
