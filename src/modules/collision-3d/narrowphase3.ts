/**
 * Domain-free 3D narrowphase collision helpers — the 3D sibling of
 * `modules/collision/narrowphase.ts`. No ECS imports and no allocation on the
 * miss path: callers compose an `Aabb3` or `Plane3` from their own
 * `Position3DDef + ShapeAabb3Def` before calling.
 *
 * Conventions (must match the component definitions):
 * - `ShapeAabb3` / `ShapeSphere3` are **centre-anchored** at `Position3DDef`,
 *   unlike the 2D shapes, which anchor at the top-left corner.
 * - `Aabb3` is already a world-space box, so nothing here needs a position
 *   component: `{ center, half }` with **half** extents.
 *
 * Edge semantics match the 2D sibling so the two read as one family:
 * box-vs-box uses strict `<` (edge contact does not count), everything
 * involving a sphere uses `<=` (touching counts), and containment is inclusive.
 */

import type { Vec3 } from '../math';

import { clamp } from '../math';

/** A world-space axis-aligned box: centre plus **half** extents. */
export interface Aabb3 {
  readonly center: Vec3;
  readonly half: Vec3;
}

export type Aabb3Axis = 'x' | 'y' | 'z';

/**
 * An oriented plane, `normal·p + constant = 0` (the three.js / Godot layout).
 * Distances are only true distances when `normal` is unit-length, which is the
 * caller's job — nothing here normalises.
 */
export interface Plane3 {
  readonly constant: number;
  readonly normal: Vec3;
}

export interface RayHit3 {
  readonly axis: Aabb3Axis;
  readonly t: number;
}

export interface SweptHit3 {
  readonly hit: boolean;
  /** Unit normal on `b`'s surface at contact. Zero vector when there is no hit. */
  readonly normal: Vec3;
  /** Fraction of `motionA` travelled before impact; `1` when there is no hit. */
  readonly tEntry: number;
}

const AXES = ['x', 'y', 'z'] as const;

/**
 * Direction components below this count as parallel to a slab. Matches the
 * value the examples' hand-rolled `rayAabb` used, so replacing it with
 * `rayVsAabb3` cannot shift which grazing rays register.
 */
const PARALLEL_EPSILON = 1e-8;

/**
 * An entry distance at or below this means the origin sits on or inside the
 * box; such a ray is reported as a miss rather than a zero-distance hit.
 */
const INSIDE_EPSILON = 1e-4;

const NO_SWEPT_HIT: SweptHit3 = Object.freeze({
  hit: false,
  normal: Object.freeze({ x: 0, y: 0, z: 0 }),
  tEntry: 1,
});

/**
 * Ray vs centre-based AABB, by the slab method. Returns the entry distance and
 * the axis of the entry face, or `null` when the ray misses, the box is
 * entirely behind the origin, or the origin is on or inside the box.
 *
 * `t` is parametric in units of `dir`, so a unit `dir` makes it a world
 * distance while a full segment `to - from` makes `t <= 1` a segment test.
 *
 * Corner tie-break: axes are tested in x, y, z order and an axis only takes
 * over the entry face on a *strictly* greater entry, so the **earlier** axis
 * wins a tie.
 */
export function rayVsAabb3(origin: Vec3, dir: Vec3, box: Aabb3): RayHit3 | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis: Aabb3Axis = 'x';
  for (const a of AXES) {
    const lo = box.center[a] - box.half[a];
    const hi = box.center[a] + box.half[a];
    if (Math.abs(dir[a]) < PARALLEL_EPSILON) {
      if (origin[a] < lo || origin[a] > hi)
        return null;
      continue;
    }
    let t1 = (lo - origin[a]) / dir[a];
    let t2 = (hi - origin[a]) / dir[a];
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
  if (tmin <= INSIDE_EPSILON)
    return null;
  return { axis, t: tmin };
}

/** True when the boxes' three axis projections all overlap. Edge contact does NOT count. */
export function aabb3VsAabb3(a: Aabb3, b: Aabb3): boolean {
  return Math.abs(a.center.x - b.center.x) < a.half.x + b.half.x
    && Math.abs(a.center.y - b.center.y) < a.half.y + b.half.y
    && Math.abs(a.center.z - b.center.z) < a.half.z + b.half.z;
}

/** True when `p` lies within the box or exactly on its boundary. */
export function aabb3ContainsPoint(box: Aabb3, p: Vec3): boolean {
  return Math.abs(p.x - box.center.x) <= box.half.x
    && Math.abs(p.y - box.center.y) <= box.half.y
    && Math.abs(p.z - box.center.z) <= box.half.z;
}

/** Box–sphere overlap: the closest point on the box to the sphere centre lies within the radius. */
export function aabb3VsSphere3(box: Aabb3, center: Vec3, radius: number): boolean {
  const dx = center.x - clamp(center.x, box.center.x - box.half.x, box.center.x + box.half.x);
  const dy = center.y - clamp(center.y, box.center.y - box.half.y, box.center.y + box.half.y);
  const dz = center.z - clamp(center.z, box.center.z - box.half.z, box.center.z + box.half.z);
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/** Two spheres overlap (or touch) when the centre distance is at most the sum of radii. */
export function sphere3VsSphere3(
  aCenter: Vec3,
  aRadius: number,
  bCenter: Vec3,
  bRadius: number,
): boolean {
  const dx = bCenter.x - aCenter.x;
  const dy = bCenter.y - aCenter.y;
  const dz = bCenter.z - aCenter.z;
  const sum = aRadius + bRadius;
  return dx * dx + dy * dy + dz * dz <= sum * sum;
}

/** True when `p` lies within the sphere or exactly on its surface. */
export function sphere3ContainsPoint(center: Vec3, radius: number, p: Vec3): boolean {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const dz = p.z - center.z;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/** Signed distance from the plane to `p` — a true distance only for a unit `normal`. */
export function plane3DistanceToPoint(plane: Plane3, p: Vec3): number {
  return plane.normal.x * p.x + plane.normal.y * p.y + plane.normal.z * p.z + plane.constant;
}

/**
 * Ray vs plane: the `t` at which the ray meets the plane, or `null` when the
 * ray runs parallel to it or the plane lies behind the origin.
 *
 * `t` is parametric in units of `dir`, exactly as in `rayVsAabb3`, so
 * `t <= 1` is a segment test.
 */
export function rayVsPlane3(origin: Vec3, dir: Vec3, plane: Plane3): number | null {
  const denom = plane.normal.x * dir.x + plane.normal.y * dir.y + plane.normal.z * dir.z;
  if (Math.abs(denom) < PARALLEL_EPSILON)
    return null;
  const t = -plane3DistanceToPoint(plane, origin) / denom;
  if (t < 0)
    return null;
  // An origin sitting on the plane divides to -0; normalise it, since signed
  // zero leaks into Object.is and 1 / v.
  return t === 0 ? 0 : t;
}

/**
 * Box–plane overlap: the box straddles the plane when its centre is no further
 * from the plane than the box's own extent along the plane normal. A box
 * resting exactly on the plane counts.
 */
export function aabb3VsPlane3(box: Aabb3, plane: Plane3): boolean {
  const reach = box.half.x * Math.abs(plane.normal.x)
    + box.half.y * Math.abs(plane.normal.y)
    + box.half.z * Math.abs(plane.normal.z);
  return Math.abs(plane3DistanceToPoint(plane, box.center)) <= reach;
}

/** Sphere–plane overlap: the centre is no further from the plane than the radius. */
export function sphere3VsPlane3(center: Vec3, radius: number, plane: Plane3): boolean {
  return Math.abs(plane3DistanceToPoint(plane, center)) <= radius;
}

/**
 * Swept AABB: `a` moves by `motionA` toward static `b`. Returns the fraction of
 * the motion at which they first touch (`tEntry ∈ [0, 1]`) and the contact
 * normal on `b`. Returns the shared frozen `NO_SWEPT_HIT` sentinel when there
 * is no collision this step.
 *
 * The classic Minkowski-sum sweep, one axis at a time: the true entry is the
 * latest per-axis entry and the true exit the earliest per-axis exit; they must
 * overlap and fall within `[0, 1]`. Already-penetrating pairs return no hit —
 * callers that need depenetration run `aabb3VsAabb3` first.
 *
 * Corner tie-break: unlike `rayVsAabb3`, a tie on entry time goes to the
 * **later** axis in x, y, z order, matching `aabbVsAabbSwept` in the 2D sibling
 * (where a tie favours the y normal over x).
 */
export function aabb3VsAabb3Swept(a: Aabb3, motionA: Vec3, b: Aabb3): SweptHit3 {
  const axis = (
    origin: number,
    size: number,
    bOrigin: number,
    bSize: number,
    motion: number,
  ): { entry: number; exit: number } | null => {
    if (motion > 0) {
      return {
        entry: (bOrigin - (origin + size)) / motion,
        exit: (bOrigin + bSize - origin) / motion,
      };
    }
    if (motion < 0) {
      return {
        entry: (bOrigin + bSize - origin) / motion,
        exit: (bOrigin - (origin + size)) / motion,
      };
    }
    // No motion on this axis: the projections must already overlap or there can
    // be no collision at all this step.
    if (origin + size <= bOrigin || origin >= bOrigin + bSize)
      return null;
    return { entry: Number.NEGATIVE_INFINITY, exit: Number.POSITIVE_INFINITY };
  };

  const minA: Vec3 = { x: a.center.x - a.half.x, y: a.center.y - a.half.y, z: a.center.z - a.half.z };
  const minB: Vec3 = { x: b.center.x - b.half.x, y: b.center.y - b.half.y, z: b.center.z - b.half.z };
  const sizeA: Vec3 = { x: a.half.x * 2, y: a.half.y * 2, z: a.half.z * 2 };
  const sizeB: Vec3 = { x: b.half.x * 2, y: b.half.y * 2, z: b.half.z * 2 };

  const x = axis(minA.x, sizeA.x, minB.x, sizeB.x, motionA.x);
  if (!x)
    return NO_SWEPT_HIT;
  const y = axis(minA.y, sizeA.y, minB.y, sizeB.y, motionA.y);
  if (!y)
    return NO_SWEPT_HIT;
  const z = axis(minA.z, sizeA.z, minB.z, sizeB.z, motionA.z);
  if (!z)
    return NO_SWEPT_HIT;

  const entry = Math.max(x.entry, y.entry, z.entry);
  const exit = Math.min(x.exit, y.exit, z.exit);
  if (entry > exit || entry < 0 || entry > 1)
    return NO_SWEPT_HIT;

  let normal: Vec3;
  if (x.entry > y.entry && x.entry > z.entry)
    normal = { x: motionA.x > 0 ? -1 : 1, y: 0, z: 0 };
  else if (y.entry > z.entry)
    normal = { x: 0, y: motionA.y > 0 ? -1 : 1, z: 0 };
  else
    normal = { x: 0, y: 0, z: motionA.z > 0 ? -1 : 1 };

  return { hit: true, normal, tEntry: entry };
}
