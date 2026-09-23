# Plan: Ship `modules/motion-3d`

Ship the 3D velocity integrator — the 3D sibling of `@pierre/ecs/modules/motion`
— and migrate every 3D consumer that hand-rolls `pos += vel · dt` onto it. Add
the canonical **`tag?: TagDef`** query-filter to *both* motion modules so an
integrator can be scoped to a marker set (Bevy `With<T>`), which is what lets a
game mixing `kinematics-3d` with plain projectiles adopt it.

## Why

`modules/motion-3d` is the velocity-integration half of the 3D-sibling stack.
Four 3D games exist; two hand-roll direct `pos += vel·dt` (doom projectiles,
starfighter ship/bullets/targets) that this replaces. Building it also exposed a
real engine gap: the 2D `makeVelocityIntegrationSystem` integrates *every*
velocity entity with no way to scope it, so a game running `kinematics-3d` over
its bodies can't also run a global integrator (double-integration). Real ECS
integrators query a filtered set (`With<Marker>`), so the fix is a canonical
`tag?` filter, added to both modules.

## Decisions

- **Scope = velocity integrator + box `Bounds3D` wrap/clamp**, mirroring 2D. This
  is the unanimous-canon part (Bevy / Godot / Unity DOTS all integrate velocity).
- **`tag?: TagDef` include-filter** — the canonical query-filter shape (Bevy
  `With<T>`, and this engine's own `kinematics-3d.dynamicTag`), **not** a
  `select` callback. Added to both `motion` and `motion-3d`; backward-compatible
  (unset = integrate all, exactly as before).
- **Reuse `math-3d`** for vectors — no `vec3.ts` in the module (`Vec3`,
  `vec3Normalize`, `vec3ScaleToLength` already live in `math-3d`).
- **Attitude control + spherical bounds are NOT shipped** — single-consumer
  (starfighter), stored in GameState not components, and not engine-canon motion
  primitives. Deferred as a `motion-3d` V2 backlog entry.
- **starfighter uses a single global `motion` pass** (it has no kinematics, so
  scoping is unnecessary — it's asteroids-shaped). The ship's muzzle now fires
  from its start-of-tick position (sub-unit, imperceptible) — an acceptable
  rework since the interleaved integrate/fire ordering was a hand-rolled artifact.
- **doom uses `tag: ProjectileTag`** so the integrator touches only projectiles,
  never the kinematics-driven player/enemies.

## Steps

### Phase 1 — Module + tag filter

- [x] `motion-3d.ts` — `makeVelocityIntegration3DSystem`, `Bounds3D`,
  `VelocityIntegration3DBoundary/Options/TickCtx`; fast (ColumnStore) + slow
  paths; `pos += vel·dt` on x/y/z with optional per-axis wrap/clamp.
- [x] `index.ts`, `README.md` (mirror 2D; document the `math-3d` + `transform-3d`
  deps).
- [x] Add `tag?: TagDef` to `motion-3d` **and** 2D `motion` (iterate the tag's
  entities when set, else all velocity entities — matching `dynamicTag`).
- [x] `motion-3d.test.ts` + a mirrored tag test added to 2D `motion.test.ts`.

### Phase 2 — Migrate doom

- [x] `projectile.ts` — split into `projectileMotionSystem`
  (`makeVelocityIntegration3DSystem({ tag: ProjectileTag, runAfter: ['weapon'] })`)
  and the collision-only `projectileSystem` (`runAfter: ['projectile-motion',
  'kinematics3d']`); drop the inline `pos += vel·dt` and now-unused velocity
  import.
- [x] `systems/index.ts` + `main.ts` — export and schedule the new system.

### Phase 3 — Migrate starfighter

- [x] `ship.ts` — split `shipSystem` (control + set velocity) from a new
  `shipBoundsSystem` (`runAfter: ['motion']`, spherical clamp).
- [x] `bullet.ts` / `target.ts` — drop inline integration; keep
  collision / bounce / spawn (`runAfter: ['motion']` / `['bullet']`).
- [x] `main.ts` — add a global `makeVelocityIntegration3DSystem({ name: 'motion',
  runAfter: ['weapon'] })` and schedule `shipBoundsSystem`.

### Phase 4 — Docs & backlog

- [x] `npm run docs:api` → regenerate `docs/agent/engine-api.md`.
- [x] `ecs-module-backlog.md` — remove the shipped `motion-3d` row; add it to the
  shipped list; add a `motion-3d` V2 entry (attitude control + non-box bounds)
  and its promotion-trigger row.
- [ ] Move this plan to `docs/plans/done/` in the final commit.

### Phase 5 — Verify

- [x] `npm run lint`, typecheck (own files clean), `npm test`.
- [x] Peer review → fix → LGTM.
- [ ] Hand off the doom + starfighter playtests to the owner (behavior-preserving
  in intent; starfighter's muzzle timing shifted sub-unit).

## Out of scope

- Attitude control / spherical bounds (→ `motion-3d` V2).
- Acceleration / forces (rigid-body concern, separate backlog entry).
- Moving `Velocity` data from `transform` to `motion` (open question tracked in
  the transform README — a both-dimensions change if ever taken).
