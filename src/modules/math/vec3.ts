/**
 * Domain-free 3D vector primitives — the `Vec3` sibling of the `Vec2` helpers in
 * `./vec2`. Every function is pure, returns a new value rather than mutating its
 * inputs, and works on a plain `{x, y, z}` object so it can be used directly on
 * a component payload.
 *
 * **Depends on nothing.**
 */

/** A plain 3D vector value object. */
export interface Vec3 { x: number; y: number; z: number }

/** `a + b`, component-wise. */
export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/**
 * `a + b * s` — the accumulate an integrator wants. One call instead of a
 * `vec3Scale` allocation plus an add.
 */
export function vec3AddScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

/**
 * `v` clamped to at most `max` in length, direction preserved — the spherical
 * bounds test. Returns `v` itself when it is already short enough, and
 * `{0, 0, 0}` for a non-positive `max`: a negative length budget means "no
 * length allowed", not "reverse the direction".
 */
export function vec3ClampLength(v: Vec3, max: number): Vec3 {
  const mag = Math.hypot(v.x, v.y, v.z);
  if (mag === 0 || mag <= max)
    return v;
  if (max <= 0)
    return { x: 0, y: 0, z: 0 };
  const k = max / mag;
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

/**
 * Right-handed cross product: the vector a right-hand rule curls `a` into `b`
 * about, with length `|a||b|sin θ`.
 */
export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Distance between two points. */
export function vec3Distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Dot product. Zero exactly when the two are perpendicular. */
export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Euclidean length. */
export function vec3Length(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

/**
 * Squared length — use it when you only need to compare distances, to skip the
 * square root.
 */
export function vec3LengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

/**
 * Component-wise linear interpolation; `t` is **unclamped** (compose with
 * `modules/math`'s `clamp01` for a bounded blend).
 */
export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/**
 * `current` stepped `delta` units along the straight line to `target` — the
 * `Vec3` sibling of `vec2MoveToward`. A forward
 * mover cannot overshoot: once the remaining distance is within `delta` the
 * target itself is returned, so repeated calls settle on it instead of
 * oscillating around it.
 *
 * `delta` is a *signed* step: a negative one walks
 * away from the target, and `0` leaves the position unchanged.
 */
export function vec3MoveToward(current: Vec3, target: Vec3, delta: number): Vec3 {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const dz = target.z - current.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance === 0 || distance <= delta)
    return { x: target.x, y: target.y, z: target.z };
  const k = delta / distance;
  return { x: current.x + dx * k, y: current.y + dy * k, z: current.z + dz * k };
}

/** `-v`. */
export function vec3Negate(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -v.z };
}

/**
 * Unit vector pointing the same way as `v`. A zero-length input has no
 * direction, so it returns `{ 0, 0, 0 }` rather than `NaN` — a caller that
 * wants a fallback direction must supply it. Matches `vec2Normalize`.
 */
export function vec3Normalize(v: Vec3): Vec3 {
  const mag = Math.hypot(v.x, v.y, v.z);
  if (mag === 0)
    return { x: 0, y: 0, z: 0 };
  return { x: v.x / mag, y: v.y / mag, z: v.z / mag };
}

/**
 * A uniformly distributed point **on** the unit sphere — every result has
 * length 1, unlike a naive per-axis random in `[-1, 1]` which biases toward the
 * corners.
 *
 * `rand` is a `[0, 1)` source, typed structurally so this module needs no import
 * for it. Pass a seeded `modules/rng` generator when the field must be
 * reproducible.
 */
export function vec3RandomUnit(rand: () => number = Math.random): Vec3 {
  const z = rand() * 2 - 1;
  const t = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - z * z);
  return { x: r * Math.cos(t), y: r * Math.sin(t), z };
}

/**
 * Reflect `v` off a surface whose normal is the **unit** vector `normal`, via
 * `v - 2(v·n)n`. A non-unit normal does not just rescale the result, it skews
 * it, so normalise first.
 */
export function vec3Reflect(v: Vec3, normal: Vec3): Vec3 {
  const k = 2 * vec3Dot(v, normal);
  return {
    x: v.x - k * normal.x,
    y: v.y - k * normal.y,
    z: v.z - k * normal.z,
  };
}

/** `v` scaled by `s`. */
export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * `v` rescaled so its length equals `length`, direction preserved — the
 * canonical "normalize then multiply" for driving a body at a fixed speed from
 * an arbitrary direction. A zero-length input returns `{ 0, 0, 0 }`. Sibling of
 * `vec2ScaleToLength`.
 */
export function vec3ScaleToLength(v: Vec3, length: number): Vec3 {
  const mag = Math.hypot(v.x, v.y, v.z);
  if (mag === 0)
    return { x: 0, y: 0, z: 0 };
  const k = length / mag;
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}

/** `a - b`, component-wise. */
export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
