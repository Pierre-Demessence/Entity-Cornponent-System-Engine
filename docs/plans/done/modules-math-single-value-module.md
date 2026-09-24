# modules/math — one value module (`Vec2` + `Vec3` + `Quat`)

Collapse the repo's value-primitive layer into a single `modules/math`, so the
`-3d` module suffix means exactly one thing everywhere: a mirrored **system**
family (`motion`/`motion-3d`, `transform`/`transform-3d`,
`collision`/`collision-3d`, `kinematics`/`kinematics-3d`).

Today the value layer is split two ways at once:

- **By dimension** — `modules/math` is scalar-only and `modules/math-3d` holds
  `Vec3` + `Quat`. No engine splits math by dimension. Unity keeps `Mathf`,
  `Vector2`, `Vector3`, `Quaternion` in one `UnityEngine` namespace; Godot keeps
  `Vector2`/`Vector3`/`Quaternion` as global built-in types with scalars in
  `@GlobalScope`; three.js puts `Vector2`/`Vector3`/`Quaternion` and the scalar
  `MathUtils` in one Math section; Unreal keeps `FMath`, `FVector`, `FVector2D`,
  `FQuat` together in Core; Bevy's `bevy_math` holds `Vec2`, `Vec3`, `Vec4`,
  `Quat`, `Mat2/3/4` in one crate (its submodules split by *number type* —
  `f32`, `f64` — never by dimension).
- **By accident** — the `Vec2` block lives in `modules/motion/vec.ts`, a
  *system* module, because no 2D value module existed when it was written.
  Canon puts vector ops in the value layer: Unity `Vector3.MoveTowards` is a
  static on `Vector3`, Godot `Vector2.move_toward` a method on `Vector2`,
  Unreal `FMath::VInterpConstantTo` in the math namespace. Nobody hangs
  `moveToward` off a motion concept.

That accident already costs real things: `steering` documents a cross-module
dependency on a **system** module for a math type (`steering.ts:1`, README
"Cross-module dependency"), and `collision/narrowphase.ts:14` declares its own
duplicate `Vec2` rather than reach into `motion`.

## Decisions (to settle before building)

- **`modules/math` is the single value module.** It holds the scalar block, the
  `Vec2` block, and the `Vec3` + `Quat` blocks. `modules/math-3d` ceases to
  exist as a path — no re-export relay (AGENTS.md: delete, don't shim).
- **File layout mirrors the block names**: `math/math.ts` (scalars),
  `math/vec2.ts`, `math/vec3.ts`, `math/quat.ts`, with one `index.ts` barrel.
  `vec2.ts` replaces `motion/vec.ts`; `vec3.ts` / `quat.ts` move across intact.
- **The `Vec2` ops take a `Vec2` object, and carry the `vec2` prefix** —
  `vec2Normalize(v)`, `vec2ScaleToLength(v, length)`, `vec2MoveToward(current,
  target, delta)`. In a module that also exports `vec3Normalize`, an unprefixed
  `normalize` is ambiguous, and the 3D ops already take a value object. This is
  the same "one operation, one name" pairing the 3D side uses, so
  `scaleToSpeed` is renamed to `vec2ScaleToLength` — the operation
  `vec3ScaleToLength` performs (Unity `ClampMagnitude`, Godot `limit_length`).
  This is the one part of the plan that changes a shipped name beyond a prefix,
  and it is confirmed — keeping two names (`scaleToSpeed` in 2D,
  `scaleToLength` in 3D) for one operation in one module is the thing to avoid.
- **`motion` / `motion-3d` become pure system modules.** `motion/index.ts` drops
  its vec re-export; `motion/README.md` drops the vector-helpers section and
  points at `modules/math`.
- **`collision`'s private `Vec2` collapses** into the shared type — it already
  imports `clamp` from `modules/math`, so this adds no new module edge.
  **`steering`** imports its `Vec2` + ops from `modules/math` instead of
  `modules/motion`; its README's cross-module note is updated to `math`.
- **No behaviour changes.** Pure relocation + rename. The `moveToward` /
  `vec3MoveToward` semantics settled separately (signed `delta`) are untouched.

## Checklist

- [x] `git mv src/modules/motion/vec.ts src/modules/math/vec2.ts` — rename the
      ops to `vec2*`, take a `Vec2` object, update the JSDoc.
- [x] `git mv src/modules/motion/vec.test.ts src/modules/math/vec2.test.ts`.
- [x] `git mv src/modules/math-3d/vec3.ts src/modules/math/vec3.ts` + its test.
- [x] `git mv src/modules/math-3d/quat.ts src/modules/math/quat.ts` + its test.
- [x] `src/modules/math/index.ts` — one barrel exporting scalars, `Vec2`,
      `vec3*`, `quat*`, `QUAT_IDENTITY`.
- [x] Delete `src/modules/math-3d/` (directory gone, not emptied).
- [x] `src/modules/motion/index.ts` — drop the vec re-export.
- [x] `src/modules/steering/steering.ts` + test — import `Vec2`, `vec2Normalize`,
      `vec2ScaleToLength` from `../math`.
- [x] `src/modules/collision/narrowphase.ts` — drop the duplicate `Vec2`, import
      the shared one.
- [x] `src/modules/collision-3d/{narrowphase3,obb3}.ts` + their tests,
      `src/modules/transform-3d/{position3d,rotation3d}.ts` — import from
      `../math`.
- [x] Migrate the `examples/` consumers in the same pass (AGENTS.md): the
      `Vec2` / `scaleToSpeed` importers (critters, stealth-guard, woodcutter,
      breakout, spacewar, top-down-shooter) and the `math-3d` importers (doom,
      portal, starfighter).
- [x] `src/modules/motion/README.md` and `src/modules/math/README.md` — the
      vector sections move to the value module; `math` stops describing itself
      as "scalars only".
- [x] Live docs that name `modules/math-3d`: `docs/engine-readiness-assessment.md`
      and the 3D-sibling section of `docs/roadmap/ecs-module-backlog.md` (math is
      shared, not a 3D-group member).
- [x] `docs/plans/modules-noise-3d-samplers.md` — its "no `modules/math-3d`
      import" note now names a path that no longer exists.
- [x] `npm run docs:api` — the generated catalog carries the new module layout.
- [x] `npm run lint` + `npm test`.
- [x] Per-example `npx tsc --noEmit` for the migrated examples (the real gate for
      them; the root typecheck is not) — `npm run typecheck:examples` is clean.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM. The only finding was that the rewritten
      `src/modules/math/README.md` was not yet staged.

## Shape notes

- Two commits, so each step stays reviewable: (1) move files + repoint every
  importer + docs; (2) the `vec2` naming/signature unification. Nothing forces
  the split beyond diff size — if it lands clean as one commit, that is fine.
- **Cheap now, expensive later.** No external consumers, so every path change
  and rename is a single-commit affair; the same change after a real external
  consumer exists is a deprecation cycle.
- The module-dependency rule still holds: `math` depends on nothing, and
  consumers (`steering`, `collision`, `collision-3d`, `transform-3d`, `camera`,
  `particles`, `tween`) all depend on it as a value module.
- Preserve the current behaviour of every moved op exactly — the only intended
  deltas are the `vec2` names and the object-shaped `Vec2` parameters.
- `modules/math-3d` rows in `docs/plans/done/` and `docs/archived/` are history
  and are not edited.
