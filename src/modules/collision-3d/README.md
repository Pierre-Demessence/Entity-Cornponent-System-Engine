# `@pierre/ecs/modules/collision-3d`

3D shapes and domain-free narrowphase helpers — the parallel sibling of
[`modules/collision`](../collision/README.md), not an extension of it. Box,
sphere, oriented box and plane tests, plus the swept-AABB push used to move a
body up to first contact.

Like its 2D sibling, the module owns **data shapes** and **maths**, not policy:
it has no broadphase, no spatial index, and no opinion about what "overlap"
means for your game. It does **not** ship a trigger system, because
`makeTriggerSystem` in the 2D module already takes its narrowphase as an
injected predicate and is therefore dimension-free — a 3D game wires the same
factory with one of these helpers.

Canon pattern: three.js `Box3` / `Sphere` / `Ray` / `OBB` / `Plane`, Godot
`AABB` / `Sphere` / `Plane`, Unity `Bounds` + `Physics.BoxCast`, Bevy `Aabb3d`
/ `Sphere` / `Ray3d`.

## Components

```ts
interface ShapeAabb3 { d: number; h: number; w: number }   // 'shape-aabb3d'
interface ShapeSphere3 { radius: number }                  // 'shape-sphere3d'
```

Both are anchored on the entity's **`position3d`**, which they require, and both
use **full extents** (a box's `w`/`h`/`d`, a sphere's `radius`).

That centre anchor is the **deliberate contrast** with the 2D shapes, which hang
off the top-left corner of `PositionDef`. Do not "fix" the difference: a 3D
overlap is symmetric about the centre, and the three 3D prototypes all store it
this way.

## Narrowphase helpers

Every helper is a pure function with no ECS knowledge.

```ts
interface Aabb3  { center: Vec3; half: Vec3 }                       // half extents
interface Obb3   { center: Vec3; half: Vec3; rotation: Quat }
interface Plane3 { constant: number; normal: Vec3 }                 // normal·p + constant = 0
interface RayHit3   { axis: 'x' | 'y' | 'z'; t: number }
interface SweptHit3 { hit: boolean; normal: Vec3; tEntry: number }

rayVsAabb3(origin, dir, box)              aabb3VsAabb3(a, b)
aabb3ContainsPoint(box, p)                aabb3VsSphere3(box, center, radius)
sphere3VsSphere3(aCenter, aRadius, bCenter, bRadius)
sphere3ContainsPoint(center, radius, p)   aabb3VsAabb3Swept(a, motionA, b)
plane3DistanceToPoint(plane, p)           rayVsPlane3(origin, dir, plane)
aabb3VsPlane3(box, plane)                 sphere3VsPlane3(center, radius, plane)

rayVsObb3(origin, dir, obb)               obb3VsSphere3(obb, center, radius)
obb3VsObb3(a, b)                          aabb3VsObb3(box, obb)
```

### Edge semantics

- **Box vs box is strict** — boxes that merely touch along a face do **not**
  overlap. This matches `aabbVsAabb`, and it is the one place where adopting
  this module can change a caller's behaviour.
- **Anything involving a sphere is inclusive** — touching counts.
- **Containment is inclusive** — `aabb3ContainsPoint` and `sphere3ContainsPoint`
  accept points exactly on the surface, as three.js does.

### Ray semantics

`t` is parametric in **units of `dir`**, which lets one function serve both ray
shapes: a unit `dir` makes `t` a world distance, while `dir = to - from` makes
`t <= 1` a segment test. `rayVsAabb3` and `rayVsObb3` return `null` when the ray
misses, when the box lies entirely behind the origin, or when the origin is on
or inside the box; `rayVsPlane3` returns `null` for a parallel ray or a plane
behind the origin.

Corner tie-break differs by function and is documented on each: a ray corner
goes to the **earlier** axis in x, y, z order (the rule the prototypes' own
`rayAabb` had, so replacing it cannot move a grazing hit), while
`aabb3VsAabb3Swept` ties to the **later** axis, matching `aabbVsAabbSwept` in
the 2D sibling.

### Oriented boxes

`Obb3.rotation` must be **unit-length** (`quatRotate`'s contract). The tests
transform the *other* shape into the box's local frame rather than rotating the
box, so `rayVsObb3` reports `axis` as one of the **box's own axes**, not a world
axis. `obb3VsObb3` is a 15-axis separating-axis test, with the degenerate
parallel cross products skipped. There is no `ShapeObb3Def` — a shape def has to
pair with an orientation component, and the engine has none yet (that is
[`modules/transform-3d`](../../../docs/roadmap/ecs-module-backlog.md)'s job).

### Swept boxes

`aabb3VsAabb3Swept` returns the fraction of the motion at which two boxes first
touch and the contact normal on the second. It returns no hit — the shared
frozen sentinel — when they **already overlap** at `t = 0`: run `aabb3VsAabb3`
first if you need depenetration. A zero-length motion never hits.

## Notes

- **Signed zero is normalised away** wherever it could appear (a ray starting on
  a plane divides to `-0`), because it leaks into `Object.is` and `1 / v`.
- **Non-finite input propagates**, as in `modules/math-3d`: a `NaN` coordinate
  gives `NaN` results rather than a silent zero.
- **No allocation on the miss path**, and no argument is ever mutated.
- The only cross-module source dependency is `clamp` from
  [`modules/math`](../math/README.md), plus the `Vec3` / `Quat` *types* and
  rotation helpers from [`modules/math-3d`](../math-3d/README.md). Both are
  deliberate; this module does not re-derive vector maths.

## Not included (by design)

- **Capsules.** Canon for a character controller rather than for a general
  narrowphase, and it belongs with `modules/kinematics-3d` — the module that
  wants it.
- **Convex hulls, meshes, triangles.** A different layer: these need a
  triangle/barycentric primitive this module does not own.
- **A broadphase or spatial index.** `modules/spatial` is the 2D answer;
  `SpatialStructure<TPos>` in core is generic, so a 3D backend can drop in
  without a change here.
- **A 3D trigger system.** The 2D `makeTriggerSystem` is dimension-free (see
  above) — do not add a second one.
- **`bounceOffAabb` / `reflect`.** Those live in the 2D narrowphase file as
  motion helpers; in 3D, `vec3Reflect` in `modules/math-3d` covers it.

## Usage

```ts
import { makeTriggerSystem } from '@pierre/ecs/modules/collision';
import { aabb3VsAabb3, rayVsAabb3, sphere3VsSphere3 } from '@pierre/ecs/modules/collision-3d';

// Compose a world-space box from the entity's position and shape components.
const pos = world.getStore(Position3DDef).get(id)!;
const shape = world.getStore(ShapeAabb3Def).get(id)!;
const box = { center: pos, half: { x: shape.w / 2, y: shape.h / 2, z: shape.d / 2 } };

// Hitscan: a unit dir makes t a world distance.
const hit = rayVsAabb3(eye, forward, box);
if (hit && hit.t < range)
  mark(hit.axis);

// Two spheres (projectile vs target).
const reach = bulletRadius + targetRadius;
if (sphere3VsSphere3(bulletPos, bulletRadius, targetPos, targetRadius))
  destroy(target);

// Pairing entities up is still the 2D module's factory — the predicate is yours.
const pickups = makeTriggerSystem({
  broadphase: ctx => pairsOfPlayerAndCoins(ctx),
  onOverlap: (ctx, _player, coin) => collect(ctx, coin),
  overlaps: (ctx, a, b) => aabb3VsAabb3(boxOf(ctx, a), boxOf(ctx, b)),
});
```
