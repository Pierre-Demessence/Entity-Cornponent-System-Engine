/**
 * Pure scalar-math helpers — the engine's `Mathf` / Godot `Math*` equivalent.
 *
 * Every function is a domain-free, dependency-free pure number op, safe for any
 * module or app to import. Vector helpers live with `modules/motion` (`vec`);
 * this module is scalars only.
 */

/** Constrain `value` to the inclusive range `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Constrain `value` to `[0, 1]`. */
export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Linearly interpolate from `a` to `b` by `t`. Unclamped: `t` may exit `[0, 1]`. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Inverse of {@link lerp}: the `t` for which `lerp(a, b, t) === value`.
 * Returns `0` for a degenerate range (`a === b`).
 */
export function inverseLerp(a: number, b: number, value: number): number {
  return a === b ? 0 : (value - a) / (b - a);
}

/**
 * Remap `value` from the range `[inMin, inMax]` onto `[outMin, outMax]`.
 * Unclamped — compose with {@link clamp} or {@link clamp01} to bound the result.
 */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return lerp(outMin, outMax, inverseLerp(inMin, inMax, value));
}

/**
 * Smooth Hermite interpolation: `0` at or below `edge0`, `1` at or above
 * `edge1`, with a smooth (zero-derivative) ramp between. Mirrors GLSL
 * `smoothstep`.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1)
    return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/**
 * Wrap `value` into the half-open range `[min, max)` — the toroidal topology
 * used for looping coordinates and angles. Returns `min` for a degenerate
 * range (`max <= min`).
 */
export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0)
    return min;
  return min + ((((value - min) % range) + range) % range);
}

/** Triangle wave: ramps `0 -> length -> 0` with period `2 * length`. */
export function pingPong(t: number, length: number): number {
  if (length <= 0)
    return 0;
  const wrapped = wrap(t, 0, 2 * length);
  return length - Math.abs(wrapped - length);
}

/** Like {@link lerp} but takes the shortest path around the circle (radians). */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrap(b - a, -Math.PI, Math.PI) * t;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Convert degrees to radians. */
export function degToRad(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

/** Convert radians to degrees. */
export function radToDeg(radians: number): number {
  return radians * RAD_TO_DEG;
}

/** Whether `a` and `b` are within `epsilon` (absolute tolerance) of each other. */
export function approximately(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}
