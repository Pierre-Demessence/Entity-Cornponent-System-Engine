# modules/motion — `moveToward` (vector form)

Close the `modules/motion — moveToward (vector form)` gap (**Existing-module
gaps**, ready). This is the *vector* form; the scalar form is already answered
by `modules/math`'s clamp/lerp pair. Canon-unanimous (Unity
`Vector3.MoveTowards`, Godot `Vector2.move_toward`, Unreal
`FMath::VInterpConstantTo`), authorized with **0 consumers** — nothing in
`src/` or `examples/` hand-rolls it today.

Companion: `docs/plans/modules-math-3d-vec3-move-toward.md` ships the 3D
sibling (separate commit — different module).

## Decisions (settled before building)

- **Take two vectors, not five numbers.** `moveToward(current: Vec2,
  target: Vec2, delta: number): Vec2`. The bare-number style in `vec.ts`
  (`normalize(x, y)`, `scaleToSpeed(x, y, speed)`) exists because those helpers
  transform *one* vector; both canon sources take two points, and `Vec2`
  already ships in this module. The 3D sibling takes two `Vec3` objects, so the
  pair stays parallel.
- **Exact arrival, no drift.** Return `target` itself when
  `distance(current, target) <= delta`, rather than a stepped approximation.
- **Non-positive `delta` returns `current`** (no movement). Coherent with the
  module's existing degenerate-input guards — e.g. `vec3ClampLength`'s
  "non-positive `max` yields the zero vector" — rather than producing
  backwards motion.
- **Zero distance returns `target`** (which equals `current`), never `NaN`.

## Checklist

- [x] Add `moveToward(current, target, delta)` to `src/modules/motion/vec.ts`,
      returning `Vec2`.
- [x] Export it from `src/modules/motion/index.ts`.
- [x] Colocated tests in `vec.test.ts` — partial step, exact arrival,
      overshoot clamp, zero-distance, `delta = 0`, negative `delta`.
- [x] `src/modules/motion/README.md` — add to the vector-helpers section and
      **remove the "No vector move-toward helper yet" bullet**.
- [x] `docs/roadmap/ecs-module-backlog.md` — drop the `moveToward (vector
      form)` entry and its status-table row.
- [x] `npm run docs:api`.
- [x] `npm run lint` + `npm test`.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.

## Shape notes

- Pure and allocation-returning, no ECS coupling, **depends on nothing**.
- Canon behaviour to preserve: a mover cannot overshoot — it lands exactly on
  the target and stays there on repeated calls.
