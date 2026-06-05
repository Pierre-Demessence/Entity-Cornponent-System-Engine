/** A plain 2D vector value object. */
export interface Vec2 { x: number; y: number }

/**
 * Unit vector pointing the same direction as `(x, y)`. A zero-length
 * input has no direction, so it returns `{ x: 0, y: 0 }` rather than
 * `NaN` — callers that want a fallback direction must supply it
 * themselves.
 */
export function normalize(x: number, y: number): Vec2 {
  const mag = Math.hypot(x, y);
  if (mag === 0)
    return { x: 0, y: 0 };
  return { x: x / mag, y: y / mag };
}

/**
 * `(x, y)` rescaled so its length equals `speed`, preserving direction.
 * The canonical "normalize then multiply" used to drive a body at a
 * fixed speed from an arbitrary direction vector (input axis, steering
 * delta, reflected velocity). A zero-length input returns
 * `{ x: 0, y: 0 }`.
 */
export function scaleToSpeed(x: number, y: number, speed: number): Vec2 {
  const mag = Math.hypot(x, y);
  if (mag === 0)
    return { x: 0, y: 0 };
  const k = speed / mag;
  return { x: x * k, y: y * k };
}
