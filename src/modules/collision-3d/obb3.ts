/**
 * Oriented-box narrowphase — the rotated sibling of `narrowphase3.ts`.
 *
 * An `Obb3` is a world-space box that carries its own orientation, so it needs
 * no component definition of its own: a *shape def* would have to pair with an
 * orientation component, which the engine does not have yet
 * (`modules/transform-3d`'s job). The value type and its tests ship now so that
 * whoever adds rotations has the collision maths waiting.
 *
 * `Obb3.rotation` is a **unit** quaternion, as `quatRotate` requires. Every test
 * here transforms the *other* shape into the box's local frame rather than
 * rotating the box, which is both cheaper and keeps the existing axis-aligned
 * code as the single source of truth for the slab maths.
 */

import type { Quat, Vec3 } from '../math';
import type { Aabb3, RayHit3 } from './narrowphase3';

import { quatConjugate, quatRotate, vec3Cross, vec3Dot, vec3Length, vec3Normalize } from '../math';
import { aabb3VsSphere3, rayVsAabb3 } from './narrowphase3';

/** A world-space oriented box: centre, **half** extents, and its rotation. */
export interface Obb3 {
  readonly center: Vec3;
  readonly half: Vec3;
  readonly rotation: Quat;
}

const UNIT_X: Vec3 = { x: 1, y: 0, z: 0 };
const UNIT_Y: Vec3 = { x: 0, y: 1, z: 0 };
const UNIT_Z: Vec3 = { x: 0, y: 0, z: 1 };
const LOCAL_BOX_CENTER: Vec3 = { x: 0, y: 0, z: 0 };

/** Below this, a cross product of two axes is treated as the zero vector (parallel axes). */
const PARALLEL_EPSILON = 1e-8;

/** The box's three own axes, expressed in world space. */
function axesOf(obb: Obb3): readonly [Vec3, Vec3, Vec3] {
  return [
    quatRotate(obb.rotation, UNIT_X),
    quatRotate(obb.rotation, UNIT_Y),
    quatRotate(obb.rotation, UNIT_Z),
  ];
}

/** The box's squared extent along `unit`: its half sizes projected onto that direction. */
function projectionRadius(obb: Obb3, axes: readonly [Vec3, Vec3, Vec3], unit: Vec3): number {
  return obb.half.x * Math.abs(vec3Dot(axes[0], unit))
    + obb.half.y * Math.abs(vec3Dot(axes[1], unit))
    + obb.half.z * Math.abs(vec3Dot(axes[2], unit));
}

/**
 * Ray vs oriented box. Same contract as `rayVsAabb3` — including the `t`
 * convention that makes `t <= 1` a segment test — but the reported `axis` names
 * one of the **box's own axes** (its local x/y/z), not a world axis.
 */
export function rayVsObb3(origin: Vec3, dir: Vec3, obb: Obb3): RayHit3 | null {
  const inverse = quatConjugate(obb.rotation);
  const localOrigin = quatRotate(inverse, {
    x: origin.x - obb.center.x,
    y: origin.y - obb.center.y,
    z: origin.z - obb.center.z,
  });
  const localDir = quatRotate(inverse, dir);
  return rayVsAabb3(localOrigin, localDir, { center: LOCAL_BOX_CENTER, half: obb.half });
}

/** Oriented-box vs sphere: transform the centre into the box's frame, then it is the axis-aligned test. */
export function obb3VsSphere3(obb: Obb3, center: Vec3, radius: number): boolean {
  const localCenter = quatRotate(quatConjugate(obb.rotation), {
    x: center.x - obb.center.x,
    y: center.y - obb.center.y,
    z: center.z - obb.center.z,
  });
  return aabb3VsSphere3({ center: LOCAL_BOX_CENTER, half: obb.half }, localCenter, radius);
}

/** An axis-aligned box seen as an oriented one, for reuse by the SAT path. */
function asObb(box: Aabb3): Obb3 {
  return { center: box.center, half: box.half, rotation: { w: 1, x: 0, y: 0, z: 0 } };
}

/**
 * Oriented-box vs oriented box by the separating-axis theorem: the two sets of
 * three face normals plus the nine cross products of their axes. The boxes
 * intersect only when **no** axis separates them.
 *
 * Edge-flush contact does **not** count, matching `aabb3VsAabb3`: an axis whose
 * gap exactly equals the two projected radii separates the pair.
 */
export function obb3VsObb3(a: Obb3, b: Obb3): boolean {
  const aAxes = axesOf(a);
  const bAxes = axesOf(b);
  const offset: Vec3 = {
    x: b.center.x - a.center.x,
    y: b.center.y - a.center.y,
    z: b.center.z - a.center.z,
  };

  const candidates: Vec3[] = [...aAxes, ...bAxes];
  for (const aAxis of aAxes) {
    for (const bAxis of bAxes)
      candidates.push(vec3Cross(aAxis, bAxis));
  }

  for (const candidate of candidates) {
    // Parallel axes give a zero cross product, and that direction is already
    // covered by the face axes, so there is nothing to test.
    if (vec3Length(candidate) < PARALLEL_EPSILON)
      continue;
    const unit = vec3Normalize(candidate);
    const gap = Math.abs(vec3Dot(unit, offset));
    if (gap >= projectionRadius(a, aAxes, unit) + projectionRadius(b, bAxes, unit))
      return false;
  }
  return true;
}

/** Axis-aligned box vs oriented box — the same SAT, with the first box seen as unrotated. */
export function aabb3VsObb3(box: Aabb3, obb: Obb3): boolean {
  return obb3VsObb3(asObb(box), obb);
}
