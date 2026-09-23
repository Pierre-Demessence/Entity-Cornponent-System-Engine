# Plan: Ship `modules/transform-3d`

Ship a new engine module `@pierre/ecs/modules/transform-3d` that mirrors the 2D
`modules/transform` sibling, **canon-complete**: `Position3D` + `Velocity3D` +
`Rotation3D` (quaternion) + `Scale3D` (per-axis vec3). Migrate the four
consumers that hand-roll these today (portal, doom, platformer-3d, starfighter)
onto it, deleting their local `Position3DDef` / `Velocity3DDef`.

## Why

`modules/transform-3d` is the last unbuilt member of the 3D-sibling group —
`math-3d`, `collision-3d`, and `kinematics-3d` already shipped. Four consumers
each hand-roll an identical `Position3DDef` and `Velocity3DDef`, and
`collision-3d` / `kinematics-3d` already declare `requires: ['position3d']`
against a component no engine module provides. A 3D transform
(translation + rotation + scale) is textbook canon (Bevy `Transform`, Unity
`Transform`, Godot `Node3D`), so it ships canon-complete under the AGENTS.md
"canon-complete over incremental" rule — `Rotation3D` and `Scale3D` ship even
though no consumer stores them as components yet.

## Decisions

- **Canon-complete scope**: ship all four (`Position3D`, `Velocity3D`,
  `Rotation3D`, `Scale3D`). Per AGENTS.md, unanimous canon ships at 0
  consumers; `Rotation3D` / `Scale3D` have no component adopters today and that
  is expected.
- **Mirror the 2D sibling**: same component set and shapes as
  `modules/transform`, so learning one dimension teaches the other. The 2D
  `Scale` is already per-axis `{x,y}`, so `Scale3D {x,y,z}` mirrors it *and*
  matches 3D canon. The only genuine 2D→3D difference is rotation: 2D `{angle}`
  scalar → 3D `Quat {w,x,y,z}`.
- **Velocity3D lives in transform-3d** (mirror 2D, where `VelocityDef` lives in
  `transform` and the integrator lives in `motion`). Whether velocity should
  instead live in `motion` is a real open question — recorded in
  `core-engine-roadmap.md`; if changed, it moves for **both** 2D and 3D in one
  pass.
- **Reuse math-3d `Vec3` / `Quat`** for `Position3D` / `Rotation3D` — matches
  the existing consumer code (`type Position3D = Vec3`) so migration is a true
  drop-in. 2D `Position` is its own interface only because there is no
  `math-2d` to reuse. `Velocity3D` / `Scale3D` stay own interfaces, mirroring
  2D `Velocity` / `Scale`.
- **Component names**: keep `position3d` / `velocity3d` (already used by all
  consumers and by `collision-3d` / `kinematics-3d` `requires`); new
  `rotation3d` / `scale3d` follow the `3d`-suffix convention.
- **Migrate via the consumer `components.ts` barrel**: re-export the two moved
  defs from each consumer's multi-symbol `components.ts` rather than rewriting
  every `getStore(...)` call-site. Allowed by the no-relay rule (a multi-symbol
  aggregating barrel is not a single-symbol relay).

## Steps

### Phase 1 — Build the module (`src/modules/transform-3d/`)

- [x] `position3d.ts` — `type Position3D = Vec3`; `Position3DDef =
  simpleComponent<Position3D>('position3d', {x,y,z:'number'})`.
- [x] `velocity3d.ts` — `interface Velocity3D {vx,vy,vz}`; `Velocity3DDef =
  ('velocity3d', {vx,vy,vz:'number'})`.
- [x] `rotation3d.ts` — `type Rotation3D = Quat`; `Rotation3DDef =
  ('rotation3d', {w,x,y,z:'number'})`; note the identity default is
  `QUAT_IDENTITY`.
- [x] `scale3d.ts` — `interface Scale3D {x,y,z}` (per-axis multiplier);
  `Scale3DDef = ('scale3d', {x,y,z:'number'})`.
- [x] `index.ts` — barrel re-exporting `{type X, XDef}` for all four, matching
  `transform/index.ts` style.
- [x] `README.md` — mirror `transform/README.md`: canon line, API block,
  "data-only; integrator ships in `modules/motion-3d`", the 2D→3D rotation
  difference, and document the type-only `math-3d` dependency (`Vec3` / `Quat`).

### Phase 2 — Tests

- [x] `transform-3d.test.ts` — serialize/deserialize round-trip per component
  and a name/`requires` assertion, following `collision-3d/shapes.test.ts`.

### Phase 3 — Migrate consumers

- [x] For each of `examples/{portal,doom,platformer-3d,starfighter}/src/components.ts`:
  remove local `Position3D` / `Velocity3D` types and defs, add
  `export { Position3DDef, Velocity3DDef, type Position3D, type Velocity3D }
  from '@pierre/ecs/modules/transform-3d'`.
- [x] Confirm no consumer added extra fields to its local defs. Leave untouched:
  starfighter `orientation: Quat` + `RadiusDef`, and every consumer's camera
  yaw/pitch (GameState / collision radius — not transform).

### Phase 4 — Docs & backlog

- [x] `npm run docs:api` → regenerate `docs/agent/engine-api.md`.
- [x] `src/modules/transform/README.md` — update the aspirational "will ship"
  note to present tense pointing at the shipped module.
- [x] `docs/roadmap/ecs-module-backlog.md` — remove the `modules/transform-3d`
  row from the "3D siblings — speculative" table.
- [x] `src/modules/transform/README.md` — record the open question (velocity
  data in `transform` vs `motion`; if moved, move both 2D and 3D in one pass) as
  design rationale where a maintainer touching velocity will see it.
  (`core-engine-roadmap.md` is scoped "no modules", so it is the wrong home.)
- [ ] Move this plan to `docs/plans/done/` in the final commit.

### Phase 5 — Verify

- [x] `npm run lint`, typecheck, `npm test` (module tests + engine-api drift),
  `npm run docs:api` clean. (Note: pre-existing `tsc` errors in `tilemap` /
  `tmx` test files are unrelated separate work — untouched by this change.)
- [x] Peer-review pass (small model, no edits, no askQuestions) → fix →
  re-review to LGTM.
- [ ] Hand off the four example playtests to the owner.

## Out of scope

- No `modules/motion-3d` integrator (its own speculative backlog entry).
- No migrating camera yaw/pitch, starfighter `orientation`, or `RadiusDef` onto
  the new rotation/scale components.
- No `package.json` / `exports` change — the `./modules/*` catch-all covers it.
