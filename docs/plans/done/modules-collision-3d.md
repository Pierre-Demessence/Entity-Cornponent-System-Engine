# Plan — `modules/collision-3d`: 3D shapes + narrowphase

Second slice of the 3D group, directly above the shipped `modules/math-3d`.
Backlog entry: the 3D sibling table's `modules/collision-3d` row
("`ShapeAabb3Def`, `ShapeSphereDef`, optional `ShapeObbDef`; AABB3 / sphere /
OBB narrowphase").

## Dual-sided verification

**Engine — ABSENT (3D), PRESENT as a complete 2D sibling.**

- `modules/collision/shape-aabb.ts:13-19` — `ShapeAabb {h, w}` + `ShapeAabbDef`,
  **top-left anchored** at `PositionDef`, `requires: ['position']`.
- `modules/collision/shape-circle.ts` — `ShapeCircle {radius}` + `ShapeCircleDef`,
  centre-anchored.
- `modules/collision/narrowphase.ts` — `Aabb {h, w, x, y}` (top-left),
  `aabbVsAabb` (strict `<`, edge contact does **not** count), `circleVsCircle`
  and `aabbVsCircle` (`<=`, touching counts), `aabbVsAabbSwept` + `SweptHit` +
  frozen `NO_HIT`, `AabbAxis = 'x' | 'y'`, `RayHit {axis, t}`, `rayVsAabb`.
  Its **only** cross-module import is `clamp` from `modules/math`, documented as
  such in the module README.
- `modules/collision/trigger.ts` — `makeTriggerSystem` takes `broadphase`,
  `onOverlap` and an **injected `overlaps` predicate**. It is therefore
  dimension-free already, and 3D needs **no trigger variant**: evidence is
  `examples/platformer-3d/src/systems/pickup.ts:39`, which wires the 2D trigger
  system with a 3D-local narrowphase today.
- ABSENT: any 3D shape component, and every 3D overlap/ray test.

**Consumers — three examples, with two byte-identical duplicates.**

- **`rayAabb(o, d, center, half): RayHit | null` exists twice, character for
  character** — `examples/doom/src/systems/math.ts:18-46` and
  `examples/portal/src/systems/portal-math.ts:65-93`. Slab method, `null` on
  miss / box behind / origin on-or-inside (`tmin <= 1e-4`), returns the entry
  distance `t` and the entry-face `axis`. The single largest duplication in the
  3D group.
- **Centre-based box overlap, twice, with *different* edge semantics**:
  `examples/doom/src/systems/projectile.ts:83-89` (`Math.abs(pa.x - pb.x) <= (a.w + b.w) / 2`,
  so touching counts) and `examples/platformer-3d/src/systems/pickup.ts:15-29`
  (the same maths with `<`, so touching does not).
- **`ShapeAabb3D {d, h, w}` is declared three times** —
  `examples/{doom,portal,platformer-3d}/src/components.ts` — registered as
  `'shape-aabb3d'` with fields `{d: 'number', h: 'number', w: 'number'}`,
  **centre-anchored** with **full extents** (doom's own comment: "Full extents
  (not half) along X/Y/Z. AABBs are center-based").
- **Sphere, once**: `examples/starfighter/src/components.ts:9,23-28` —
  `Radius {r}` + `RadiusDef` (`'radius'`), set on the ship (1.1), bullets (0.35)
  and targets (1.6). Its uses are genuine sphere tests:
  `systems/bullet.ts:47-52` bullet↔target (`reach = rad.r + tr.r`, i.e.
  sphere-vs-sphere), `systems/bullet.ts:38` bullet↔bounds
  (`Math.hypot(pos…) > BOUNDS_RADIUS`, i.e. point-in-sphere), and
  `systems/ship.ts:77` / `systems/target.ts:31` (`BOUNDS_RADIUS - RADIUS`).
- **Out of scope but load-bearing evidence**: `resolveAxis` exists three times
  (`examples/{doom,portal,platformer-3d}/src/systems/kinematics3d.ts`) and does
  its own centre-based overlap inline (`halfW + shW - Math.abs(pos.x - sp.x)`).
  That is the 3D character controller — `modules/kinematics-3d`'s slice — and it
  is *why* this slice must come first: it is a consumer of these primitives, not
  a competitor to them.

**Canon.**

- **three.js — VERIFIED this pass** from the official docs:
  `Box3` is `{min, max}` with `intersectsBox`, `intersectsSphere`,
  `containsPoint` (inclusive of the boundary), `clampPoint`, `distanceToPoint`,
  `setFromCenterAndSize`; `Sphere` is `{center, radius}` with `intersectsBox`,
  `intersectsSphere`, `containsPoint`, `clampPoint`; `Ray` is
  `{origin, direction}` with `intersectBox` → point or `null`, `intersectsBox` →
  boolean, `intersectSphere`. So ray-vs-box, box-vs-box, box-vs-sphere,
  sphere-vs-sphere and point containment are all first-class canon.
- **Godot (`AABB`/`Sphere`), Bevy (`Aabb3d`/`Sphere`/`Ray3d`), Unity (`Bounds`) —
  recall, NOT verified this pass.** They are cited in the README's canon line
  only after being checked; anything unverified gets dropped rather than
  asserted, which is the mistake the previous slice's review caught (a
  right-handed-Unity claim).

## Decision record

**Decision.** Ship `src/modules/collision-3d/` as a parallel sibling of
`modules/collision`: the 3D shape defs, a world-space box value type, and the
narrowphase helpers the consumers actually hand-roll. Adopt it in all four 3D
examples in this commit.

**Options considered.**

1. *Add `z` to the 2D module's shapes.* Rejected, and already a standing rule
   ("Do not add `z` to `PositionDef`" — it breaks `HashGrid2D`, every query and
   the 2D contract). Dimension-sensitive work ships as parallel siblings.
2. *Ship only `rayVsAabb3`,* the single worst duplication. Rejected: the box
   overlap is duplicated twice more with *divergent* edge semantics, and a
   shape def is duplicated three times. That is the "half-baked primitive"
   failure mode this project suffers from.
3. **Chosen:** the full shape + narrowphase surface for box and sphere, mirroring
   the 2D sibling's file layout (`shape-aabb3.ts`, `shape-sphere3.ts`,
   `narrowphase3.ts`).

**Boundaries drawn deliberately.**

- **`Aabb3` is centre + half-extents**, not min/max. Every one of the three
  consumers passes a centre and a half-size (`rayAabb(o, d, center, half)`; the
  `resolveAxis` overlap maths), and the slab implementation already in the
  examples is written that way — so the lift is behaviour-preserving rather than
  a re-derivation. Canon is split (three.js min/max, Godot position+size, Unity
  centre+extents), and the consumers break the tie, as they should.
- **`ShapeAabb3` is centre-anchored with full extents**, the deliberate contrast
  with the 2D sibling's top-left anchor. All three declarations agree, and
  centre-based is what makes the 3D maths symmetric; the README says so
  explicitly so nobody "fixes" the inconsistency.
- **OBB and plane are IN, by explicit decision.** No example hand-rolls
  either, but both are canon-complete subsystems rather than speculative
  additions: three.js ships `OBB` as a math class, `Plane.intersectsBox` /
  `intersectsSphere` / `Ray.intersectPlane`, and `Box3.intersectsPlane` — the
  plane type interoperates with exactly the shapes in this module. Godot ships
  `Plane` and `BoxShape3D` (rotatable), Unity `BoxCast` / freely-rotated
  `BoxCollider`. The user's call on this slice: *canon justifies shipping with
  zero consumers*; only a genuinely *novel* shape waits for a second consumer.
  So the sweep test also comes in — it is the 3-axis generalisation of the
  algorithm the 2D sibling already ships, not an invention.
- **No `ShapeObb3Def` component.** The narrowphase takes an `Obb3` value, but a
  *component* would need an orientation component to pair with, and the engine
  has none yet — that is `modules/transform-3d`'s `Rotation3DDef`. Shipping the
  value type now and the def when its dependency exists keeps the component
  surface honest.
- **No OBB SAT against a mesh, no capsule, no triangle.** Those are the
  convex/mesh layer and the character-controller layer, not this module's
  charter; capsule in particular lands with `kinematics-3d`, which is the thing
  that wants it.
- **No `bounceOffAabb` / `reflect`.** Those live in the 2D narrowphase file as
  motion helpers; the 3D side already has `vec3Reflect` in `modules/math-3d`.
- **The trigger system is reused, not duplicated.** `makeTriggerSystem` is
  dimension-free by construction.

## API

```ts
// shape-aabb3.ts
interface ShapeAabb3 { d: number; h: number; w: number }   // full extents, centre-anchored
ShapeAabb3Def                                              // 'shape-aabb3d', requires position3d

// shape-sphere3.ts
interface ShapeSphere3 { radius: number }                  // centre-anchored
ShapeSphere3Def                                            // 'shape-sphere3d', requires position3d

// narrowphase3.ts
interface Aabb3 { center: Vec3; half: Vec3 }
type Aabb3Axis = 'x' | 'y' | 'z'
interface RayHit3 { axis: Aabb3Axis; t: number }
interface SweptHit3 { hit: boolean; normal: Vec3; tEntry: number }
interface Plane3 { constant: number; normal: Vec3 }        // normal·p + constant = 0

rayVsAabb3(origin, dir, box): RayHit3 | null
aabb3VsAabb3(a, b): boolean
aabb3ContainsPoint(box, p): boolean
aabb3VsSphere3(box, center, radius): boolean
sphere3VsSphere3(aCenter, aRadius, bCenter, bRadius): boolean
sphere3ContainsPoint(center, radius, p): boolean
aabb3VsAabb3Swept(a, motionA, b): SweptHit3
plane3DistanceToPoint(plane, p): number
rayVsPlane3(origin, dir, plane): number | null
aabb3VsPlane3(box, plane): boolean
sphere3VsPlane3(center, radius, plane): boolean

// obb3.ts
interface Obb3 { center: Vec3; half: Vec3; rotation: Quat }
rayVsObb3(origin, dir, obb): RayHit3 | null
obb3VsSphere3(obb, center, radius): boolean
obb3VsObb3(a, b): boolean
aabb3VsObb3(aabb, obb): boolean
```

`Quat` gains `quatConjugate`, because every OBB test needs the inverse rotation
and `math-3d` has only `quatRotate`. Canon (three.js `Quaternion.conjugate`,
Bevy `Quat::conjugate`) plus a real consumer inside this same change.

Edge semantics, matched to the 2D sibling so the module reads as one family:
strict `<` for box-vs-box (edge contact does not count), `<=` for everything
involving a sphere (touching counts), `containsPoint` inclusive of the boundary
(as in three.js). `rayVsAabb3` keeps the examples' exact contract, including the
`1e-4` rejection of an origin on or inside the box and `t` being parametric in
units of `dir`.

## Tasks

- [x] `src/modules/collision-3d/shape-aabb3.ts` — `ShapeAabb3` + `ShapeAabb3Def`.
- [x] `src/modules/collision-3d/shape-sphere3.ts` — `ShapeSphere3` + `ShapeSphere3Def`.
- [x] `src/modules/collision-3d/narrowphase3.ts` — box, sphere, plane and swept helpers.
- [x] `src/modules/collision-3d/obb3.ts` — `Obb3` + its four tests (SAT for OBB↔OBB).
- [x] `src/modules/collision-3d/index.ts` — barrel.
- [x] `src/modules/math-3d/quat.ts` — add `quatConjugate` (canon + the OBB tests' inverse).
- [x] `narrowphase3.test.ts` / `obb3.test.ts` / `shapes.test.ts` — axis-by-axis
      symmetry, the strict-vs-inclusive edge cases at exactly-touching boxes and
      spheres, the ray's miss / behind / inside / grazing / corner-tie cases,
      SAT against a rotated box (including near-parallel axes), and degenerate
      (zero-size, zero-radius, zero-length, identity-rotation) inputs.
- [x] `src/modules/collision-3d/README.md` — API, the centre-anchor contrast
      with the 2D sibling, canon (verified sources only), "not included (by
      design)".
- [x] Adopt in doom — `systems/math.ts` now holds only `forwardVec`; `rayVsAabb3`
      at its three sites; `projectile.ts`'s `overlaps` → `aabb3VsAabb3`;
      `ShapeAabb3D{,Def}` re-exported from the engine.
- [x] Adopt in portal — `portal-math.ts`'s `rayAabb` + `RayHit` deleted (it
      keeps `forwardVec` / `localCoords` / `withinOpening`); `rayVsAabb3` at the
      grab-reach and portal-placement rays; shape re-exported.
- [x] Adopt in platformer-3d — `pickup.ts`'s 12-argument `overlaps3d` deleted;
      its `makeTriggerSystem` predicate calls `aabb3VsAabb3`; shape re-exported.
- [x] Adopt in starfighter — `sphere3VsSphere3` for bullet↔target and
      `sphere3ContainsPoint` for the bullet bounds. **Deviation:** its
      `Radius { r }` component stays local — a single copy with its own field
      name, so re-pointing it at `ShapeSphere3` would ripple an `r` → `radius`
      rename through six files without removing a duplicate. Its ship/target
      `Math.hypot` distance checks also stay: they use the value to clamp a
      position, not as an overlap test.
- [x] `npm run docs:api`; docs: `collision-3d` row dropped from the 3D group
      table and its ray-vs-AABB tally mention removed.
- [x] `npm test` + `npm run lint` clean; `tsc --noEmit` clean in all four examples.
- [ ] Peer review to LGTM.

## Invariants

- Pure geometry: no ECS imports beyond the component-def factory, and the only
  cross-module import is `clamp` from `modules/math` — the same documented
  dependency the 2D sibling has.
- No allocation on the miss path; no mutation of any argument.
- The shape defs' registered names keep the house 3D suffix (`'shape-aabb3d'`,
  `'shape-sphere3d'`) so adopting them is a pure type/import swap for the
  examples, with no component-name churn.

## Behaviour deltas to accept knowingly

Two, both recorded rather than hidden:

1. doom's projectile overlap currently counts *exactly touching* boxes as a hit
   (`<=`); the module's strict rule does not. One frame either side of a
   projectile grazing a wall — invisible in play, but it is a real change, so it
   goes in the commit message rather than being buried.
2. **None.** starfighter's `Radius { r }` stays local — a single copy with its
   own field name, so re-pointing it at the engine's sphere shape would have
   rippled a rename through six files without removing a duplicate. Its ship and
   target also keep their `Math.hypot` checks, which feed a position clamp
   rather than answering an overlap question.

## Adoption risk

The ray lift is behaviour-preserving by construction (the module's body is the
examples' body). The box overlap is behaviour-preserving except for the strict
edge rule above. All four examples are playtest-owned, so each needs an eyeball
before it counts as verified — doom and portal most of all, since their hitscan
and portal placement ride on the ray test.
