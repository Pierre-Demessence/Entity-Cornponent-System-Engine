# Plan — `modules/math-3d`: `Vec3` + `Quat` primitives

First slice of the 3D group. Backlog entry: the 3D sibling table's
`modules/math-3d` row ("`Vec3` siblings of the `Vec2` motion helpers; `Quat`
(mul / axis-angle / rotate-vector), `cross`, `dot`").

## Dual-sided verification (2026-09-22)

**Engine — ABSENT.** `modules/math` is scalars only (`math.ts:1-8`),
`modules/motion/vec` is `Vec2` with just `normalize` + `scaleToSpeed`, and
`modules/collision/narrowphase` is 2D over a top-left-anchored `Aabb`. There is
no `Vec3` and no `Quat` anywhere in `src/`.

**Consumers — all four 3D examples, with one honest caveat.** A full inventory of
`platformer-3d`, `portal`, `doom`, `starfighter` (the only examples depending on
`three`) found:

- **12 declarations of the same `{x,y,z}` shape** under three names: `Vec3`
  exported from three `game.ts` files, four file-local `interface Vec3`, four
  `Position3D` in `components.ts`, and one inline literal. The single largest
  duplication.
- **Hand-rolled vector ops** at the point of use: `cross` and `normalize` in
  `portal/src/systems/portal-gun.ts:147,155`; manual dot products in
  `carry.ts:47` and `portal-gun.ts:126`; hand-written projective dot products
  duplicating `localCoords` in `portal/src/render.ts:631-638`; a
  normalize-then-scale written out in `doom/src/systems/ai.ts:92-105`; sphere
  bounds-clamping in `starfighter/src/game.ts:163`; uniform-unit-vector sampling
  in `starfighter/src/game.ts:155` **and again inline** in its
  `render.ts:58-62`; sphere reflection in `starfighter/src/systems/target.ts:44-49`.
- **One hand-rolled quaternion file**, `examples/starfighter/src/quat.ts`:
  `Quat`, `IDENTITY_QUAT`, `quatMul`, `quatNormalize`, `quatFromAxisAngle`,
  `quatRotate`, `quatForward`, `quatUp` — names the module can adopt verbatim, so
  that migration is an import swap. It is **not** duplication-driven (one copy);
  its case is canon plus the vocabulary win.

**Caveat, stated up front.** A large share of the 3D math *lines* in these
examples is game-specific and must stay there: portal frame transforms
(`localCoords`, `transformPoint`, `withinOpening`, `axisVec`, `samePlane`), the
spherical play-boundary convention, both camera rigs (orbit, chase), the
mouse-look layers, and every `THREE.*` adapter call. Also note the `Vec2`
precedent is *deliberately minimal* — `normalize` + `scaleToSpeed` only — so
"Vec3 siblings of the Vec2 helpers" cannot be read as "port three.js `Vector3`".

## Decision record

**Decision.** Ship `Vec3` + a core op set and a `Quat` block as pure functions in
`src/modules/math-3d/`, with `vec3*` / `quat*` name prefixes. Adopt it in all
four examples in this commit.

**Options considered.**

1. *Mirror `modules/motion/vec`'s surface exactly* (`normalize`,
   `scaleToSpeed`, `Vec2` → `Vec3`). Rejected: too thin. The 3D evidence includes
   `cross`, `dot`, reflection and clamp-length, which the 2D side never needed.
2. *Bare names* (`normalize`, `lerp`, `clamp`). Rejected: `modules/math` already
   exports scalar `lerp`/`clamp`/`approximately`, and 3D consumers import it
   (`examples/doom/src/main.ts` does, since the mouse-look change). Prefixed
   names also match `modules/noise`'s convention and starfighter's existing
   `quatMul`/`quatRotate`/`quatFromAxisAngle`, which makes that migration
   mechanical.
3. **Chosen:** prefixed, object-in/object-out ops. The two scalar-input helpers
   the 2D side has are represented by `vec3ScaleToLength` (normalize-then-multiply
   as one call), which removes the hand-rolled `1/mag` arithmetic at the call
   sites rather than restating it.

**Boundaries drawn deliberately.**

- **3D `rayAabb` and the 3D AABB overlap are NOT here.** The inventory flags them
  as the strongest duplication wins (two byte-identical `rayAabb`s; five
  centre-based overlap sites), but they are `collision-3d`'s primitives per the
  group table. This slice stays a value-primitive module, exactly like
  `modules/math` and `modules/noise`.
- **`forwardVec(yaw, pitch)` is NOT here**, despite being verbatim ×2
  (`doom/src/systems/math.ts:4`, `portal/src/systems/portal-math.ts:6`). It bakes
  in a convention — YXZ Euler, `-Z` forward — and camera rigs are the 3D group's
  `camera-3d`. A generic math module must not own an Euler order.
- **No Euler ↔ quaternion conversion.** Nothing hand-rolls it (the examples use
  three.js `Euler`), so it would be speculative, and Euler order is the exact
  can of worms the previous bullet avoids.
- **No `quatSlerp`.** Canon-unanimous but with no hand-rolled consumer —
  `starfighter/src/render.ts:204` uses three.js's own `slerp` where it already
  holds a `THREE.Quaternion`. Recorded rather than built.

## API

```ts
// vec3.ts
interface Vec3 { x: number; y: number; z: number }
vec3Add(a, b)              vec3Sub(a, b)            vec3Scale(v, s)
vec3AddScaled(a, b, s)     vec3Negate(v)            vec3Lerp(a, b, t)
vec3Dot(a, b)              vec3Cross(a, b)
vec3Length(v)              vec3LengthSq(v)          vec3Distance(a, b)
vec3Normalize(v)           vec3ScaleToLength(v, length)
vec3Reflect(v, normal)     vec3ClampLength(v, max)  vec3RandomUnit(rand?)

// quat.ts
interface Quat { w: number; x: number; y: number; z: number }
QUAT_IDENTITY              quatMul(a, b)            quatNormalize(q)
quatFromAxisAngle(axis, angle)                      quatRotate(q, v)
quatForward(q)             quatUp(q)
```

Zero imports: `rand` is typed `() => number` structurally (matching
`modules/rng`'s `RandomFn`) rather than importing it, so the module keeps
`modules/math`'s "depends on nothing" property.

## Tasks

- [x] `src/modules/math-3d/vec3.ts` — the `Vec3` type + op set.
- [x] `src/modules/math-3d/quat.ts` — the `Quat` type + block.
- [x] `src/modules/math-3d/index.ts` — barrel.
- [x] `vec3.test.ts` / `quat.test.ts` — zero-length and degenerate inputs, range
      invariants (unit outputs stay unit), the rotate/forward/up conventions,
      `quatMul` associativity and identity, `randomUnit` staying on the sphere.
      **42 tests.** (Three added in review: the zero/negative-budget
      `vec3ClampLength` cases, and the default-`Math.random` path.)
- [x] `src/modules/math-3d/README.md` — API, canon, "not included (by design)".
- [x] Adopt in starfighter — deleted `src/quat.ts`; `vec3ClampLength` for
      `clampToBounds`; `vec3RandomUnit` for `randomUnitVec` and the inline
      duplicate in `render.ts`.
- [x] Adopt in portal — `vec3Cross`/`vec3Normalize` in `portal-gun.ts`,
      replacing its local `cross`/`normalize`.
- [x] Adopt in doom — `vec3Normalize` in the `inSight` ray direction. **Deviation:**
      the AI normalize-then-scale this item named is *not* a 3D vector op — that
      site steers in the XZ plane only (`dx`/`dz`, `y` unused), so routing it
      through `Vec3` would allocate a vector to do two scalar multiplies.
- [x] Unify the `{x,y,z}` shape: local `interface Vec3` declarations become the
      module's `Vec3`, and each `components.ts` keeps its domain name as
      `type Position3D = Vec3`. **12 declarations → 0**; `grep -r 'interface
      Vec3' examples/` is empty.
- [x] `npm run docs:api`; docs: `math-3d` row dropped from the 3D group table
      and its `Vec3`/`Quat` tally entry; the readiness 3D claims narrowed.
- [x] `npm test` + `npm run lint` clean; `tsc --noEmit` clean in all four examples.
- [x] Peer review to LGTM. **4 passes.** Found and fixed: the starfighter
      `Position3D` that pass 1 caught still hand-rolling the shape; a real bug in
      `vec3ClampLength` (a negative `max` reversed the direction instead of
      clamping); an undocumented non-finite-input contract; a false canon claim
      (Unity is left-handed, not a right-handed `+Z` source); two stale doc
      references; and — pass 2 — a pass-1 fix that had reported success but
      never applied to `quat.test.ts`. Pass 4 returned LGTM.

**Not done, deliberately.** The `vec3Dot` adoptions the portal item hoped for
(`carry.ts`, `portal-gun.ts`, `render.ts`) are dropped: each computes the dot
product inline from components already extracted for the distance test in the
same expression, so `vec3Dot` would have to rebuild a `Vec3` to remove nothing.
The module ships the primitive; forcing every call site through it is not the
same win as removing a hand-rolled *function*. The same reasoning leaves
`starfighter/src/systems/target.ts` on its hand-rolled sphere reflection, which
sits in a single pass that also bounds-clamps and writes a component back —
`vec3Reflect` there would allocate two `Vec3`s to delete one line.

## Invariants

- Pure functions, no ECS imports, and **no imports outside the module
  directory** (matching `modules/math` / `modules/noise`; `quat.ts` imports its
  sibling `./vec3`).
- No mutation: every op returns a new object, so a `Vec3` in a component store
  can be passed freely.
- `vec3Normalize({0,0,0})` returns zero rather than `NaN`, matching
  `motion/vec`'s documented choice.
- `quatFromAxisAngle` normalises its axis; `quatRotate` documents that the
  quaternion must be unit-length (as `quatMul`-composed rotations are).

## Adoption risk

Type-only unification of `Position3D` (a `type` alias to `Vec3`) is
source-compatible at every use site, and the ops replacements are
behaviour-identical. All four examples are playtest-owned, so each needs an
eyeball before it counts as verified — starfighter most of all, since it is the
one whose rotation math actually changes hands.

## Result

Shipped `src/modules/math-3d/` (`vec3.ts`, `quat.ts`, `index.ts`, two test
files, README) and adopted it in all four 3D examples — **21 files** import from
the module. `examples/starfighter/src/quat.ts` is deleted, and no example
hand-rolls the `{x,y,z}` shape any more: its four `components.ts` files each
alias the module's `Vec3` as `Position3D`.

Verified: 42 module tests pass (suite 1200, 75 files); `tsc --noEmit` exits 0 in
`doom`, `portal`, `platformer-3d` and `starfighter`; `npm test` and
`npm run lint` clean; `docs/agent/engine-api.md` regenerated.

Two items were resolved differently from what the task list sketched (both
recorded in place above): the doom site turned out to be an XZ-plane steer
rather than a 3D normalize-then-scale, and the portal `vec3Dot` adoptions were
dropped as pure call-site churn.

The review also paid for itself twice over on correctness rather than style: it
found a genuine direction-reversal bug in `vec3ClampLength` for a negative
budget (unreachable from today's consumers, but wrong), and it showed that
"the fix is applied" cannot be taken from an edit tool's success message — the
`quat.test.ts` title rename had to be re-applied after pass 2 found it
untouched.
