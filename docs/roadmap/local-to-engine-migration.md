# Local → Engine Migration — Top 10

Prioritized worklist for pulling hand-rolled example code into the engine
before the next prototype. Sourced from the
[engine-gap-ledger](engine-gap-ledger.md) triage (2026-07-15, exhaustive
source-cited pass) and the [module backlog](ecs-module-backlog.md).

> **Re-cited 2026-07-15 against the stamped ledger, then dual-side
> verified.** Three pre-correction entries were wrong: (1) the old #3
> `world.reset()` was a phantom (`clearAll()`@[`world.ts:103`](../../src/world.ts)
> ships + is adopted); (2) the old #1 "adopt boundary for ~10" was
> mis-scoped (the shipped clamp pins only an *origin point*); (3) a
> **single-sided-citation** error — the first correction stamped only the
> *engine* side and still wrongly listed "flappy, jetpack **wrap**" as
> adopters. Opening the *consumer* source (5th pass) shows flappy/jetpack
> are **size-aware vertical clamps**, not wrap, and the pointer projector
> is module-private + stateful. Lesson: an *adopt* claim is a join of
> engine-shape **and** consumer-fit — both need a `file@line`. #1 and #4
> below now carry both sides.

Two kinds of entry:

- **Adopt** — capability *already ships*; the example just hand-rolls it.
  Pure migration, ~zero engine code. Cheapest wins.
- **Build** — a real gap; a new module, a module extension, or a core
  tweak is needed first, then migrate the consumers.

Ordered by **impact ÷ effort**: cheap + high-consumer-count first.
Effort is T-shirt (S / M / L). Nothing here is a commitment to land all
ten — it's the priority queue.

## The queue

| # | Item | Type | Consumers | Effort | Why this rank |
|---|---|---|---|---|---|
| 1 | Motion boundary `wrap` + `clamp` (full-playfield, point) | **Adopt — done** (`modules/motion`) | 2 done | — | `boundary:{mode}` ([motion.ts:51](../../src/modules/motion/motion.ts)) pins the **origin point** to `[0,width]` only. Already adopted by the 2 full-playfield games: asteroids@[`main.ts:43`](../../examples/asteroids/src/main.ts) (wrap), top-down-shooter@[`main.ts:164`](../../examples/top-down-shooter/src/main.ts) (clamp). The other 5 (flappy@[`systems.ts:113`](../../examples/flappy/src/systems.ts), jetpack@[`systems.ts:122`](../../examples/jetpack/src/systems.ts), frogger@[`systems.ts:118`](../../examples/frogger/src/systems.ts) span-recycle, local-pong@[`systems.ts:89`](../../examples/local-pong/src/systems.ts), space-invaders@[`systems.ts:65`](../../examples/space-invaders/src/systems.ts)) are **size/span-aware** → that's **#3** (the inset Build), not adoption. **No clean adoption work remains.** |
| 2 | `modules/rng` — shuffle / pick / seed | **Build — shipped** (new util) | 3 (card-battler, solitaire, snake) | — | **Done 2026-07-15.** Shipped `shuffle`/`pick`/`randomInt`/`makeSeededRng`@[`rng/rng.ts`](../../src/modules/rng/rng.ts); all 3 consumers migrated off their hand-rolled Fisher–Yates / `Math.random` picks. Seedable generator unblocks deterministic tests. |
| 3 | `modules/math` — scalar helpers (clamp, lerp, …) | **Build — shipped** (new), reshaped from boundary-inset | 9 (collision + 8 games) | M | **Done 2026-07-18.** Dual-side check **reshaped** this row: the size/margin-aware clamp was framed as a `VelocityIntegrationBoundary` inset extension, but **no consumer routes its clamped entity through the integrator** — every site clamps imperatively in a bespoke movement system, so a boundary-mode extension would be a 0-consumer build. The real shared idiom is a bare `clamp`. Shipped `modules/math`@[`math/math.ts`](../../src/modules/math/math.ts) — 12 universal scalar helpers (`clamp`/`clamp01`/`lerp`/`inverseLerp`/`remap`/`smoothstep`/`wrap`/`pingPong`/`lerpAngle`/`degToRad`/`radToDeg`/`approximately`). **Home:** a module (not core — core stays ECS-structural); `modules/collision`@[`narrowphase.ts:44`](../../src/modules/collision/narrowphase.ts) documents the cross-module dep (the `cooldown`→`timer` pattern). Migrated 8 `clamp` sites (breakout paddle+angle, local-pong, space-invaders, frogger, jetpack `vy`, tilemap zoom, rpg) + retired local-pong's & rpg's private `clamp`s + breakout `BALL_MAX_BOUNCE`→`degToRad`; refactored the #7 spawner ramps (jetpack@[`game.ts`](../../examples/jetpack/src/game.ts), top-down-shooter@[`game.ts`](../../examples/top-down-shooter/src/game.ts)) to `lerp`/`inverseLerp`/`remap`. `moveToward` deferred to motion/`vec` (vector form); `sign` omitted (native). |
| 4 | Pointer→canvas projection — export a pure `projectPointer()` | **Build — shipped** (`modules/input`) | 2 (breakout, solitaire) | S | **Done 2026-07-18.** Promoted the module-private `defaultProject` to an exported pure `projectPointer(ev, target)`@[`pointer-provider.ts`](../../src/modules/input/pointer-provider.ts) (the DPI-aware client→backing-pixel projection; `PointerProvider` still uses it as its default). breakout@[`main.ts`](../../examples/breakout/src/main.ts) + solitaire@[`main.ts`](../../examples/solitaire/src/main.ts) dropped their verbatim event-time copies for the one fn. (tilemap = custom viewport project; space-invaders = no-DPI half-screen — neither fits, as noted.) |
| 5 | `modules/motion` vector util (normalize / set-speed) | **Build — shipped** (extension) | 2 done (breakout, top-down-shooter) | — | **Done 2026-07-15.** Shipped `normalize` + `scaleToSpeed`@[`motion/vec.ts`](../../src/modules/motion/vec.ts). Migrated breakout `setBallSpeed`@[`systems.ts:27`](../../examples/breakout/src/systems.ts) and top-down-shooter player-move@[`input.ts:44`](../../examples/top-down-shooter/src/systems/input.ts) + enemy-steer@[`enemy-steer.ts:33`](../../examples/top-down-shooter/src/systems/enemy-steer.ts) off their hand-rolled `hypot` rescales. |
| 6 | `modules/timer` + `modules/cooldown` | **Build — shipped** (new) | 3 (asteroids, top-down-shooter, space-invaders) | — | **Done 2026-07-16.** Shipped a Bevy-style **`Timer` value primitive**@[`timer/timer.ts`](../../src/modules/timer/timer.ts) (once/repeating, `tickTimer`/`finished`/`fraction`/`restart`) as the shared timing core. Refactored `modules/lifetime` onto it (`Lifetime = Timer`, `makeLifetime`) and shipped `modules/cooldown`@[`cooldown/cooldown.ts`](../../src/modules/cooldown/cooldown.ts) (`CooldownDef` + `makeCooldownSystem` + `ready`/`trigger`). **Shape correction:** cooldown is a **per-entity component**, not a GameState scalar — fire-rate gates (asteroids@[`input.ts`](../../examples/asteroids/src/systems/input.ts), top-down-shooter@[`input.ts`](../../examples/top-down-shooter/src/systems/input.ts)) and i-frames (space-invaders@[`systems.ts`](../../examples/space-invaders/src/systems.ts)) are all **poll-`ready()`/`trigger()` once-mode** users. jetpack's `bulletTimerMs`/`spawnTimerMs` are repeating **auto-emitters**, not poll/trigger gates → deferred to **#7 spawner** (built on repeating `Timer`). |
| 7 | `modules/spawner` | **Build — shipped** (new) | 4 (flappy, jetpack, space-invaders, top-down-shooter) | M | **Done 2026-07-17.** Shipped a **value-object `Spawner`**@[`spawner/spawner.ts`](../../src/modules/spawner/spawner.ts) (`makeSpawner(nextIntervalMs, { active? })`, `tickSpawner(s, dtMs, emit)`, `resetSpawner`) — a cadence/difficulty-ramp emitter built as the repeating sibling of `Timer`. **Shape correction:** chose a value object that owns its own `remainingMs` accumulator + a per-interval provider callback (not a `SpawnerDef` component), because each consumer's *next interval* is a live function of game state (elapsed, scroll speed, wave) and the *what-to-emit* stays app-defined. The provider pattern absorbs ramp+jitter without an engine-side `rampPerSec` knob. Migrated all 4: flappy pipes@[`systems.ts`](../../examples/flappy/src/systems.ts) (fixed interval), top-down-shooter enemies@[`spawner.ts`](../../examples/top-down-shooter/src/systems/spawner.ts) (elapsed-ramp), jetpack obstacles+bullets@[`systems.ts`](../../examples/jetpack/src/systems.ts) (ramp+jitter, plus a thrust-gated bullet emitter via the `active` gate), space-invaders bombs+mothership@[`systems.ts`](../../examples/space-invaders/src/systems.ts) (wave-ramp + random-range). jetpack's interval timers (re-homed from #6) land here as intended. |
| 8 | `modules/collision` V2 — reflection response | **Build** (extension) | 3 (breakout, local-pong, frogger) | M | Kinematics already does push-out+zero; add the velocity-**reflect** helper for bouncers. |
| 9 | `RenderableDef` text/shape adoption + overlay pass | **Adopt + Build** | 2 (local-pong, snake) | M | Text/rect/circle/polygon already ship (adopt now); the camera-independent **overlay** pass is the genuine new bit. |
| 10 | `modules/camera` V2 — camera-consume + view-rect cull | **Build — shipped** (extension) | 2 (rpg, tilemap) | M–L | **Done 2026-07-18.** Built **canon-complete** Godot `Camera2D` parity (minus rotation), not the minimal slice — `CameraDef` gained zoom/offset/limits; added follow `smoothing` + drag-margin `deadzone`, zoom-aware `worldToView`/`viewToWorld`, `cameraViewRect`, `cameraToView`, `clampCameraToLimits`, `makeCamera`@[`camera/camera.ts`](../../src/modules/camera/camera.ts). The renderer gained an optional `view` transform + off-screen view-rect cull@[`canvas2d-renderer.ts`](../../src/modules/render-canvas2d/canvas2d-renderer.ts), **decoupled** (consumes plain `{x,y,zoom?}`, never imports `camera`; bridge via `cameraToView`). Migrated rpg@[`main.ts`](../../examples/rpg/src/main.ts) (smooth follow + map limits, drops the manual `translate` + offset clamp, and is the live per-entity **cull** consumer) and tilemap@[`main.ts`](../../examples/tilemap/src/main.ts) (adopts `CameraDef` for pan/zoom; bakes the static 10k-tile map to one offscreen bitmap drawn through `cameraToView` — the canonical static-tilemap technique that stays seam-free at fractional zoom, where per-tile drawing leaves sub-pixel gaps; zoom-aware pointer pick via `viewToWorld`). Rotation deferred. |

## Suggested sequencing

1. **Adoption sweep — collapsed on dual-side verification.** What looked
   like cheap adoptions aren't: #1 boundary is already adopted by the 2
   games that fit (the other 5 hand-roll size-aware clamps — the #3 work, shipped as `modules/math`); #4 pointer needs the
   `projectPointer` export first (a Build); the old world-reset adopt is
   already done (`clearAll()`). The only *possible* remaining adoption is
   the text/shape half of #9 — **not yet consumer-verified**, so don't
   trust it until both sides are opened.
2. **Small utilities (2, 5).** Pure functions; land + migrate same day.
3. **Small modules (6, 7).** `cooldown` then `spawner` — both 4-consumer,
   both shooter-relevant.
4. **Targeted extensions (8, 10).** `collision` reflection (8) and
   `camera` V2 camera-consume (10) need design care; do them when their
   consumers are next touched. (#3 shipped as `modules/math` — reshaped
   from the boundary-inset extension; see the queue row.)
5. **Overlay pass (9, build half).** The new screen-space layer — larger,
   do last.

## Out of scope for this top-10

Deferred-but-lower-priority (still in the backlog): `modules/grid-movement`
(3), `modules/attach` (3, un-declines parenting), `modules/particles` (4,
MET but moderate effort), GID-flip render honour (2), `modules/animation`
(1), `modules/ai` (2, contested), `modules/rhythm` / app-host
(speculative). Promote any of them up the queue if the next prototype
needs it.

## References

- [engine-gap-ledger.md](engine-gap-ledger.md) — raw gap tally + Status.
- [ecs-module-backlog.md](ecs-module-backlog.md) — full module entries
  with Scope / Trigger / Canon.
- [extending-the-engine.md](../extending-the-engine.md) — the
  sliding-scale promotion rule each build still runs through.
