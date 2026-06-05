# Plan: `modules/math` (migration #3, reshaped)

**Status:** validated; awaiting commit

A tiny tree-shakeable module of pure scalar-math helpers. Born from
migration-queue **#3** ("motion boundary inset / per-entity size"), which a
dual-side check reshaped: the real shared idiom across the candidate
consumers is **not** a `VelocityIntegrationBoundary` extension (no consumer
routes its clamped entity through the integrator) but a bare `clamp`.

## Shape decision (resolved with user)

- **Home = `modules/math`** — not core, not `modules/motion`. Core stays
  strictly ECS-structural; numeric helpers are modules (consistent with
  `vec` living in `modules/motion`). A module consumer (collision)
  documents the dep in its README, exactly like `cooldown` -> `timer`.
- **Ship the full scalar canon (12 fns).** Per the promotion rule, these
  are *unanimous universal canon* (every engine has them) so they ship even
  at 0-1 consumers. Several already have live consumers here (clamp x10,
  lerp/inverseLerp/remap in the #7 spawner ramps, degToRad in breakout).
- **`moveToward` excluded** -> the game-useful form is the *vector* one
  (`Vector2.move_toward`), which belongs next to `vec` in `modules/motion`.
  Logged as a motion/vec candidate for when a consumer appears (camera
  follow, #10). **`sign` excluded** -> native `Math.sign`.
- Audio's `clamp01` is a **validator that throws**, not a clamp -> NOT
  migrated to the new pure `clamp01`.
- Reshapes queue #3; the old "extend `VelocityIntegrationBoundary`" framing
  is retired (0 consumers route their clamped entity through it).

## API

```ts
clamp(value, min, max)                       // -> [min, max]
clamp01(value)                               // -> [0, 1]
lerp(a, b, t)                                // a + (b-a)*t, unclamped
inverseLerp(a, b, value)                     // t for lerp(a,b,t)==value; 0 if a==b
remap(value, inMin, inMax, outMin, outMax)   // lerp . inverseLerp, unclamped
smoothstep(edge0, edge1, x)                  // GLSL Hermite, clamped 0..1
wrap(value, min, max)                        // toroidal into [min, max)
pingPong(t, length)                          // triangle wave, period 2*length
lerpAngle(a, b, t)                           // shortest-path angular lerp (rad)
degToRad(deg)  /  radToDeg(rad)              // angle conversions
approximately(a, b, epsilon = 1e-6)          // |a-b| <= epsilon
```

Import: `@pierre/ecs/modules/math` (apps) / `../math` (sibling modules).

### Backlog (universal canon, deferred to a real consumer)
- `moveToward` -> `modules/motion`/`vec` (vector form).
- `ease`, `snapped`, `deltaAngle` -> add when a game needs them.

## Consumers (dual-side verified)

| Consumer | kind | site | idiom |
|---|---|---|---|
| collision narrowphase | module | narrowphase.ts:42-43 | closest-point `Math.max(a.x, Math.min(c.x, a.x+a.w))` |
| breakout | app | systems.ts:58 (paddle), :142 (angle `[-1,1]`) | bound + angle clamp |
| local-pong | app | systems.ts:89 (paddle), :154 (impact); drop private `clamp`:26 | bound + normalize |
| space-invaders | app | systems.ts:69 (player) | inset bound |
| frogger | app | systems.ts:64 (frog) | bound |
| jetpack | app | systems.ts:46 (vy), game.ts:205 (ramp `t`) | velocity bound + clamp01-as-clamp |
| tilemap | app | main.ts:124 (zoom) | bound |
| rpg | app | main.ts:303 (drop private `clamp`) | existing private clamp |

**NOT migrated:** audio `clamp01` (validator, throws — different semantics).

## Checklist

- [x] `src/modules/math/math.ts` (12 fns: clamp, clamp01, lerp, inverseLerp,
      remap, smoothstep, wrap, pingPong, lerpAngle, degToRad, radToDeg,
      approximately)
- [x] `src/modules/math/index.ts` barrel
- [x] `src/modules/math/math.test.ts`
- [x] `src/modules/math/README.md`
- [x] Migrate collision narrowphase + document dep in collision README
- [x] Migrate breakout (paddle bound + angle clamp + `degToRad` for BALL_MAX_BOUNCE)
- [x] Refactor #7 spawner ramps to `remap`/`lerp` (jetpack `nextObstacleIntervalMs`, top-down `currentSpawnInterval`)
- [x] Migrate local-pong (paddle + impact; drop private `clamp`)
- [x] Migrate space-invaders (player bound)
- [x] Migrate frogger (frog bound)
- [x] Migrate jetpack (vy + ramp `t`)
- [x] Migrate tilemap (zoom)
- [x] Migrate rpg (drop private `clamp`)
- [x] Update roadmap row #3 (reshaped -> shipped), ledger + backlog
- [x] Full test + lint green
- [x] Peer review (subagent, no-edit/no-askQuestions) -> LGTM
- [ ] Move plan to `docs/plans/done/` in same commit

## Peer review -> LGTM

Reviewer verified all 12 fns mathematically correct (incl. wrap / lerpAngle /
smoothstep edge cases) and all 11 migrations behavior-preserving. Both #7 ramp
refactors confirmed **arithmetically identical** to their originals (jetpack
bit-identical; top-down identical on the reachable `elapsedMs >= 0` domain
where `clamp01 == Math.min(1, .)`). Nits addressed: +4 edge assertions
(smoothstep coincident-edge, approximately boundary, pingPong negative /
multi-period, lerpAngle half-turn) -> 30 math tests; fixed narrowphase line
cite. The `degToRad(60)` vs `(60*Math.PI)/180` <=1-ULP reassociation is
observationally identical (fed into clamp . sin/cos, no equality test) and kept
as the intended dedup. Browser-smoked breakout / local-pong / tilemap /
top-down-shooter, 0 errors.
