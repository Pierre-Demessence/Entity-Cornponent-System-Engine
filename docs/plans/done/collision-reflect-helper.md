# Collision V2 — Velocity Reflect Helper

Plan for item #8 of `local-to-engine-migration.md`.

## Goal

Add a velocity-reflect helper to `modules/collision` so bounce-heavy
games (breakout, local-pong) don't hand-roll the same reflection math.

## What ships already

- `aabbVsAabb` — static overlap test
- `aabbVsAabbSwept` — swept collision with contact normal
- `circleVsCircle`, `aabbVsCircle` — other overlap tests
- `modules/kinematics` — push-out + zero-velocity for platformers

## What's missing

No `reflect` primitive. Consumers hand-roll:

1. **Wall bounce**: `Math.abs(vel.vx)` / `-Math.abs(vel.vx)` to flip one
   axis — an axis-aligned special case of the general reflect formula.
2. **AABB brick/bat bounce**: compute overlap on each axis, pick minimum,
   push out, flip velocity on that axis.

## Design

### `reflect(v, normal)`

Pure vector reflection: $v' = v - 2(v \cdot n)n$.

The normal must be unit-length (caller's responsibility — zero-alloc, no
`Math.hypot` in the hot path). For axis-aligned surfaces this is zero-cost:
`{1,0}`, `{-1,0}`, `{0,1}`, `{0,-1}`.

### `bounceOffAabb(mover, moverVel, obstacle)`

Given two overlapping AABBs and the mover's velocity, compute a
minimum-translation-vector separation and reflect the velocity off the
contact surface.

Returns `null` if there's no overlap.

This is the higher-level primitive breakout's brick collision and pong's
wall bounce both hand-roll. The paddle-bat angle mapping stays
game-specific (it's not a pure reflect — it maps impact position to
launch angle).

## Subtasks

- [x] Add `reflect(v: Vec2, normal: Vec2): Vec2` to `narrowphase.ts`
- [x] Add `bounceOffAabb(mover, vel, obstacle)` to `narrowphase.ts`
- [x] Unit tests in `narrowphase.test.ts`
- [x] Export from `index.ts`
- [x] Migrate breakout wall bounce + brick collision
- [x] Migrate local-pong wall bounce
- [x] Typecheck + lint + test — all green
- [x] Update migration doc row #8
