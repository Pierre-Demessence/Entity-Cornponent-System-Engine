/**
 * Domain-free 2D narrowphase collision helpers. No ECS imports,
 * no allocation on the miss path — callers compose `{x,y,w,h}`
 * and `{x,y}` structs from their own `PositionDef + ShapeAabbDef`
 * or `PositionDef + ShapeCircleDef` before calling.
 *
 * Anchor conventions (must match the component definitions):
 * - `Aabb.{x,y}` = top-left corner.
 * - Circles: centre is `{x,y}`; radius is scalar.
 */

import type { Vec2 } from '../math';

import { clamp } from '../math';

/** Re-exported from `modules/math` so collision callers share one vector type. */
export type { Vec2 };

/** Axis-aligned bounding box: top-left `x` / `y` plus width `w` and height `h`. */
export interface Aabb {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** Two AABBs overlap when their projections on both axes overlap. Edge contact does NOT count as overlap. */
export function aabbVsAabb(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.w
    && a.x + a.w > b.x
    && a.y < b.y + b.h
    && a.y + a.h > b.y;
}

/** Two circles overlap (or touch) when the distance between centres ≤ sum of radii. */
export function circleVsCircle(pa: Vec2, ra: number, pb: Vec2, rb: number): boolean {
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const sum = ra + rb;
  return dx * dx + dy * dy <= sum * sum;
}

/** Circle–AABB overlap: closest point on the AABB to the circle centre lies within the radius. */
export function aabbVsCircle(a: Aabb, c: Vec2, r: number): boolean {
  const cx = clamp(c.x, a.x, a.x + a.w);
  const cy = clamp(c.y, a.y, a.y + a.h);
  const dx = c.x - cx;
  const dy = c.y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Result of a swept AABB test: whether it `hit`, the surface `normal`, and `tEntry` (fraction of the motion travelled before impact). */
export interface SweptHit {
  readonly hit: boolean;
  /** Collision normal on `b`'s surface (unit vector). `{0,0}` when no collision. */
  readonly normal: Readonly<Vec2>;
  /** Fraction of `motionA` travelled before impact. `1` when no collision. */
  readonly tEntry: number;
}

const NO_HIT: SweptHit = Object.freeze({
  hit: false,
  normal: Object.freeze({ x: 0, y: 0 }),
  tEntry: 1,
});

/**
 * Swept AABB: `a` moves by `motionA` toward static `b`. Returns the
 * first fraction of motion at which they touch (`tEntry ∈ [0, 1]`) and
 * the contact normal on `b`. Returns the shared frozen `NO_HIT`
 * sentinel (`{hit:false, tEntry:1, normal:{0,0}}`) when there's no
 * collision this step.
 *
 * The classic Minkowski-sum sweep: compute entry/exit times on each
 * axis independently, then the actual entry is the latest entry and
 * the actual exit is the earliest exit; they must overlap and fall
 * within `[0,1]`.
 *
 * Edge cases (all return `NO_HIT`):
 * - **Already penetrating at `t=0`**: callers that need
 *   depenetration should run `aabbVsAabb` separately before sweeping.
 * - **Zero motion on an axis where projections don't overlap**: no
 *   way to collide on that axis, so no collision at all.
 * - **Zero motion on an axis where projections overlap**: that axis
 *   doesn't constrain entry time; the other axis decides.
 * - **Both axes zero motion**: always returns `NO_HIT`. Use
 *   `aabbVsAabb` for static overlap checks.
 *
 * Corner-hit tie-break: when `x.entry === y.entry`, the y-axis
 * normal wins (favouring vertical surfaces over horizontal edges).
 */
export function aabbVsAabbSwept(a: Aabb, motionA: Vec2, b: Aabb): SweptHit {
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
    // No motion on this axis: the projections must already overlap or
    // there can be no collision at all this step.
    if (origin + size <= bOrigin || origin >= bOrigin + bSize)
      return null;
    return { entry: Number.NEGATIVE_INFINITY, exit: Number.POSITIVE_INFINITY };
  };

  const x = axis(a.x, a.w, b.x, b.w, motionA.x);
  if (!x)
    return NO_HIT;
  const y = axis(a.y, a.h, b.y, b.h, motionA.y);
  if (!y)
    return NO_HIT;

  const entry = Math.max(x.entry, y.entry);
  const exit = Math.min(x.exit, y.exit);
  if (entry > exit || entry < 0 || entry > 1)
    return NO_HIT;

  // Normal comes from whichever axis had the later entry (the axis
  // where contact was actually made).
  const normal: Vec2 = x.entry > y.entry
    ? { x: motionA.x > 0 ? -1 : 1, y: 0 }
    : { x: 0, y: motionA.y > 0 ? -1 : 1 };

  return { hit: true, normal, tEntry: entry };
}

/** Which face of an AABB a hit is on — `'x'` (a vertical face) or `'y'` (a horizontal face). */
export type AabbAxis = 'x' | 'y';

/** Result of a ray-vs-AABB hit: the entry `axis` and parametric distance `t` along `dir`. */
export interface RayHit {
  /** The face the ray entered through. */
  readonly axis: AabbAxis;
  /**
   * Entry point, parametric in units of `dir`: a world distance when `dir` is
   * unit-length, or a fraction of the segment when `dir` is `to - from`.
   */
  readonly t: number;
}

/**
 * Ray vs AABB, slab method. Returns the entry `t` (strictly positive) and the
 * axis of the face it enters through, or `null` when the ray misses, the box
 * lies entirely behind the origin, or the origin is on or inside the box.
 *
 * `t` is parametric in units of `dir`, which is what makes one function serve
 * both ray shapes: pass a **unit** vector for a world distance (hitscan,
 * picking), or the **segment** vector `to - from` and treat `t <= 1` as "the
 * segment crosses the box" (line-of-sight against walls).
 *
 * A zero-length `dir` never hits. A ray travelling exactly along a face counts
 * as a hit once it enters that face's span from outside (the slab method treats
 * boxes as closed) — an origin already sitting on the boundary is still a miss,
 * as above — and so does a corner graze, where entry and exit land on the same
 * `t`. Its `axis` is whichever face the ray ultimately enters through, which
 * need not be the face it grazes. When two axes enter at the same `t` — a ray
 * through an exact corner or crack — the `y` face wins, consistent with
 * `aabbVsAabbSwept` and `bounceOffAabb`.
 *
 * Note that the 3D copies in `examples/portal` / `examples/doom` break corner
 * ties the other way (`x` wins), and use a small tolerance rather than an exact
 * zero test, so a port is not a byte-for-byte match.
 *
 * For "is the origin already inside?" — which this function answers `null` —
 * compose `aabbVsAabb` with a zero-size box at the origin instead of paying
 * for a flag on this path.
 */
export function rayVsAabb(origin: Vec2, dir: Vec2, box: Aabb): RayHit | null {
  const maxX = box.x + box.w;
  const maxY = box.y + box.h;

  // Parallel to a slab: either the origin lies within it (that axis cannot
  // constrain the entry) or nothing on this axis can ever meet the box.
  if (dir.x === 0 && (origin.x < box.x || origin.x > maxX))
    return null;
  if (dir.y === 0 && (origin.y < box.y || origin.y > maxY))
    return null;

  let tEnter = Number.NEGATIVE_INFINITY;
  let tExit = Number.POSITIVE_INFINITY;
  let axis: AabbAxis = 'x';

  if (dir.x !== 0) {
    const near = (box.x - origin.x) / dir.x;
    const far = (maxX - origin.x) / dir.x;
    tEnter = near < far ? near : far;
    tExit = near < far ? far : near;
  }

  if (dir.y !== 0) {
    const near = (box.y - origin.y) / dir.y;
    const far = (maxY - origin.y) / dir.y;
    const yEnter = near < far ? near : far;
    const yExit = near < far ? far : near;
    if (yEnter >= tEnter) {
      tEnter = yEnter;
      axis = 'y';
    }
    if (yExit < tExit)
      tExit = yExit;
  }

  // `tEnter` stays -Infinity when both components are zero.
  if (tEnter > tExit || tEnter <= 0)
    return null;

  return { axis, t: tEnter };
}

/** A collision resolution: `pushOut` to separate the mover from the obstacle, and its reflected `velocity`. */
export interface BounceResult {
  /** Displacement to add to the mover's position to separate the two AABBs. */
  pushOut: Vec2;
  /** Reflected velocity — the mover's velocity bounced off the contact surface. */
  velocity: Vec2;
}

/**
 * Reflect a velocity vector off a surface normal using the standard
 * formula `v' = v - 2(v·n)n`. The caller must supply a **unit-length**
 * normal; axis-aligned normals like `{1,0}` or `{0,-1}` are zero-cost.
 */
export function reflect(v: Vec2, normal: Vec2): Vec2 {
  const dot = v.x * normal.x + v.y * normal.y;
  return {
    x: v.x - 2 * dot * normal.x,
    y: v.y - 2 * dot * normal.y,
  };
}

/**
 * Resolve an AABB overlap with a pure velocity reflection on the
 * minimum-separation axis.
 *
 * Returns `null` when the two boxes are **not** overlapping (edge
 * contact does not count).  Callers must check `aabbVsAabb` first if
 * they need to distinguish "no overlap" from "overlap resolved".
 *
 * The returned `pushOut` is the minimum translation vector — add it to
 * the mover's position to depenetrate.  The returned `velocity` is the
 * mover's original velocity reflected on the separation axis; the
 * caller should replace the mover's velocity component with it.
 *
 * Tie-break: when X and Y overlaps are equal, the Y axis wins
 * (consistent with `aabbVsAabbSwept`).
 */
export function bounceOffAabb(
  mover: Aabb,
  vel: Vec2,
  obstacle: Aabb,
): BounceResult | null {
  const overlapRight = mover.x + mover.w - obstacle.x;
  const overlapLeft = obstacle.x + obstacle.w - mover.x;
  const overlapBottom = mover.y + mover.h - obstacle.y;
  const overlapTop = obstacle.y + obstacle.h - mover.y;

  const overlapX = Math.min(overlapRight, overlapLeft);
  const overlapY = Math.min(overlapTop, overlapBottom);

  if (overlapX <= 0 || overlapY <= 0)
    return null;

  if (overlapX < overlapY) {
    const pushX = overlapRight < overlapLeft ? -overlapX : overlapX;
    return {
      pushOut: { x: pushX, y: 0 },
      velocity: reflect(vel, pushX > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 }),
    };
  }

  const pushY = overlapTop < overlapBottom ? overlapY : -overlapY;
  return {
    pushOut: { x: 0, y: pushY },
    velocity: reflect(vel, pushY > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 }),
  };
}
