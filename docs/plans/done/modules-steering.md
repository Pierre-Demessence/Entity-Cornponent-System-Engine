# modules/steering — Reynolds steering behaviors

First AI primitive. Split off the one AI sub-topic that has **strong
canon** (Reynolds 1987 steering behaviors) from the contested
`modules/ai` (BT/FSM/GOAP) backlog entry. Prove the shape with a new
`examples/boids` playground, then extract `modules/steering` and migrate
the existing seek/chase consumers.

## Why steering first

- **Strongest canon in all of AI.** Reynolds' steering-behaviors set
  (seek/flee/arrive/pursue/evade/wander/separation/alignment/cohesion)
  is universal across Unity, Godot, Unreal, and every boids demo. Per
  `docs/extending-the-engine.md`, strong canon → ship the
  canon-complete surface.
- **Existing consumers already hand-roll the seek slice:**
  top-down-shooter `enemy-steer.ts` (constant-speed seek) and doom
  `ai.ts` chase state.
- **Composes with `modules/motion`** — steering returns a force/desired
  velocity; motion integrates it. Pure functions, minimal surface,
  trivially demotable.

## Workflow (repo promote-from-example process)

1. Build steering helpers **locally** in `examples/boids/src/steering.ts`.
2. Get flocking + cursor-flee + food-arrive + wander feeling right.
3. Extract to `src/modules/steering/`.
4. Migrate boids to consume the module; migrate top-down-shooter + doom
   seek/chase as the 2nd/3rd consumers validating the shape.

## Open questions the PoC must answer

- **Force vs desired-velocity model.** Classic Reynolds returns a
  steering *force* = `desired − velocity`, accumulated as acceleration,
  truncated to `maxForce`, with velocity truncated to `maxSpeed`. This is
  what produces smooth emergent flocking (momentum blending). The
  constant-speed consumers (top-down-shooter/doom) currently just *set*
  `velocity = dir * speed`. Decide whether the module ships force-based
  helpers only, or also a thin desired-velocity path for the snap case.
- **Behavior combination.** Weighted sum + truncate-to-maxForce vs
  priority arbitration. PoC proves the weighting API (`combine`).
- **Neighbor supply.** Flocking (separation/alignment/cohesion) needs
  neighbors. Steering stays ECS-decoupled: it takes plain neighbor
  arrays; the app builds them from `ContinuousHashGrid2D.queryNear`.

## Target surface (canon-complete, pure Vec2)

- `seek(pos, target, vel, maxSpeed) → Vec2`
- `flee(pos, target, vel, maxSpeed) → Vec2`
- `arrive(pos, target, vel, maxSpeed, slowRadius) → Vec2`
- `pursue(pos, vel, targetPos, targetVel, maxSpeed) → Vec2`
- `evade(pos, vel, targetPos, targetVel, maxSpeed) → Vec2`
- `wander(vel, state, params) → Vec2` (per-agent wander angle state)
- `separation(pos, neighbors, maxSpeed, vel) → Vec2`
- `alignment(vel, neighbors, maxSpeed) → Vec2`
- `cohesion(pos, neighbors, vel, maxSpeed) → Vec2`
- `combine(weighted, maxForce) → Vec2`
- `truncate(v, max) → Vec2`

Depends on `modules/motion` vec helpers (`normalize`, `scaleToSpeed`,
`Vec2`) — documented cross-module dep, same pattern as
`collision → math`.

## Checklist

- [x] Plan doc (this file).
- [x] Scaffold `examples/boids` (package.json, index.html, vite.config,
      tsconfig, src/).
- [x] Local `steering.ts` helpers (canon-complete set above).
- [x] Boids game: flock (sep/align/cohesion) + wander + cursor-flee +
      food-arrive, neighbours via `ContinuousHashGrid2D`.
- [x] Tune feel until flocking reads well. (Pierre playtested — accepted.)
- [x] Register in `examples/hub` (README doesn't enumerate examples).
- [x] Example `build` + `lint` pass.
- [x] Extract `src/modules/steering/` (+ colocated tests — 20 tests).
- [x] `steering` picked up by the `./modules/*` export glob + regen
      `engine-api` (drift test green).
- [x] Migrate boids → `@pierre/ecs/modules/steering` (local copy deleted).
- [x] top-down-shooter `enemy-steer.ts` + doom `ai.ts` chase — assessed
      **non-fit**: both are constant-speed `velocity = dir × speed`
      (already `motion.scaleToSpeed`); force-migrating changes feel with
      no win. Documented in the backlog; not migrated.
- [x] Module README.
- [x] Docs: backlog `modules/steering` shipped entry + `modules/ai`
      annotation + promotion-trigger row.
- [x] Peer review (subagent) — no logic errors; added maxSpeed=0 +
      separation inverse-distance tests + one "why" comment. Full suite
      957 green.

## Follow-up (not this plan)

`modules/fsm` as pick #2 — an FSM PoC (stealth/patrol guard) whose
"chase" state runs a steering behavior; doom becomes the 2nd FSM
consumer at extraction.
