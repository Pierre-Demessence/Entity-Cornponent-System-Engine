# Plan: `modules/spawner` (migration #7)

**Status:** validated; awaiting commit

The cadence/difficulty-ramp emitter primitive. Sibling of `modules/timer`:
where `Timer` is a single countdown, `Spawner` is a repeating cadence that
invokes an emit callback every interval, with the interval recomputed per
cycle (fixed / difficulty-ramp / jitter all via one provider).

## Shape decision (resolved with user)

Value-object + `tickSpawner(spawner, dtMs, emit)` function — **not** a
per-entity component. Every candidate consumer keeps its spawner as a single
GameState-level global, so the component pattern (cooldown/lifetime) would
over-fit. API mirrors `Timer`/`tickTimer`.

### Why not literally wrap a `Timer`

Faithful **overshoot-carry across variable intervals** is required (flappy /
top-down-shooter drain-all `acc -= interval`). Once-mode `Timer` clamps to 0
on finish and discards overshoot; repeating-mode wraps with a *fixed*
duration. Neither supports a fresh per-cycle interval with drift-free carry.
So `Spawner` owns a small signed accumulator — conceptually the repeating
sibling of `Timer`, documented as such, but not code-reusing `tickTimer`.

## API

```ts
interface Spawner {
  remainingMs: number;            // counts down; <=0 -> emit + reschedule
  readonly nextIntervalMs: () => number; // fixed | ramp | jitter
  readonly active?: () => boolean;       // optional gate (jetpack thrust)
}
makeSpawner(nextIntervalMs, options?: { active?: () => boolean }): Spawner
tickSpawner(s, dtMs, emit: () => void): void   // drain-all, overshoot carry
resetSpawner(s, remainingMs?): void            // default = fresh interval
```

- `tickSpawner`: gate-off -> hold `remainingMs = 0` (fires immediately on
  re-enable, matching jetpack-bullet). Drain-all loop carries overshoot; a
  non-positive interval halts that tick (infinite-loop guard) plus a hard
  iteration cap.

## Consumer shapes (dual-side evidence)

| Consumer | system | interval | gate | count |
|---|---|---|---|---|
| flappy `pipeSpawn` | up-accumulator | fixed `PIPE_SPAWN_MS` | none | drain-all |
| top-down-shooter `spawner` | up-accumulator | ramp `currentSpawnInterval(elapsed)` | none | drain-all |
| jetpack `spawn` | countdown | ramp+jitter `base+rand*400` | none | single |
| jetpack `bullet` | countdown | fixed `BULLET_INTERVAL_MS` | thrusting | single |
| space-invaders `bomb` | countdown | wave-ramp+jitter | none | single |
| space-invaders `mothership` | countdown | random range | none | single |

## Checklist

- [x] `src/modules/spawner/spawner.ts` (Spawner, makeSpawner, tickSpawner, resetSpawner)
- [x] `src/modules/spawner/index.ts` barrel
- [x] `src/modules/spawner/spawner.test.ts` (fixed, ramp, jitter, drain-all carry, gate, zero-interval guard)
- [x] `src/modules/spawner/README.md` (notes sibling-of-timer rationale)
- [x] Migrate flappy `pipeSpawn`
- [x] Migrate top-down-shooter `spawner`
- [x] Migrate jetpack `spawn` + `bullet`
- [x] Migrate space-invaders `bomb` + `mothership`
- [x] Update migration roadmap row 7 (-> shipped, dual-side cites w/ line anchors)
- [x] Update gap ledger B2 (-> resolved)
- [x] Update module backlog (spawner -> shipped entry + TOC + promotion table)
- [x] Full test + lint green
- [x] Peer review (subagent, no-edit/no-askQuestions) -> LGTM
- [ ] Move plan to `docs/plans/done/` in same commit

## Peer review (round 2 -> LGTM)

Round 1 found ONE blocker: `makeSpawner` called `nextIntervalMs()` at
construction, so the three consumers that build the spawner inside a
self-referential `const state = { spawner: makeSpawner(() => state.x) }` literal
(top-down-shooter `elapsedMs`, jetpack obstacle `scrollSpeed`, space-invaders
bomb `wave`) threw a TDZ `ReferenceError` at `start()` — invisible to
test/lint/build since none run an example's `start()`.

Fix (engine-side lazy seed): `makeSpawner` stores `remainingMs: NaN` and never
calls the provider; `tickSpawner` seeds the first interval on the first tick
(`if (Number.isNaN(s.remainingMs)) s.remainingMs = s.nextIntervalMs()`).
Arithmetically identical to the old eager path; resolves all three consumers
with zero consumer edits. Added a `MAX_EMITS_PER_TICK = 10_000` runaway-dt cap,
a `resetSpawner(s, 0)` immediate-emit test, and a cap test; README documents
both. Round 2 = LGTM.

Browser smoke (examples hub, all three previously-crashing games): top-down-
shooter spawns enemies (reads `elapsedMs`), jetpack scrolls obstacles (reads
`scrollSpeed`), space-invaders runs the fleet and drops bombs (reads `wave`).
Zero `pageerror` events in any of the three.
