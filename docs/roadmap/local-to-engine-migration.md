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
| 3 | Motion boundary **inset / per-entity size** extension | **Build** (`modules/motion` ext) | 4 (breakout paddle, frogger, local-pong, space-invaders) | S–M | The shipped clamp pins a *point* to `[0,width]`; size/margin-aware clampers need `[inset, width−inset]` or half-extent bounds. Extend `VelocityIntegrationBoundary`@[`motion.ts:15`](../../src/modules/motion/motion.ts) with an inset/half-size. (Replaces the old phantom `world.reset()` row.) |
| 4 | Pointer→canvas projection — export a pure `projectPointer()` | **Build** (`modules/input`) | 2 (breakout, solitaire) | S | The DPI math ships only as the **module-private** `defaultProject`@[`pointer-provider.ts:140`](../../src/modules/input/pointer-provider.ts); `PointerProvider` is a stateful, tick-read provider. breakout@[`main.ts:103`](../../examples/breakout/src/main.ts) + solitaire@[`main.ts:146`](../../examples/solitaire/src/main.ts) project at **event-time** (replicating `defaultProject` exactly), so they can't adopt the provider without a timing/arch change. Export the pure `(ev,target)=>{x,y}` → then they adopt that one fn. (tilemap = custom viewport project; space-invaders = no-DPI half-screen — neither fits.) |
| 5 | `modules/motion` vector util (normalize / set-speed) | **Build — shipped** (extension) | 2 done (breakout, top-down-shooter) | — | **Done 2026-07-15.** Shipped `normalize` + `scaleToSpeed`@[`motion/vec.ts`](../../src/modules/motion/vec.ts). Migrated breakout `setBallSpeed`@[`systems.ts:27`](../../examples/breakout/src/systems.ts) and top-down-shooter player-move@[`input.ts:44`](../../examples/top-down-shooter/src/systems/input.ts) + enemy-steer@[`enemy-steer.ts:33`](../../examples/top-down-shooter/src/systems/enemy-steer.ts) off their hand-rolled `hypot` rescales. |
| 6 | `modules/cooldown` | **Build** (new) | 4 (asteroids, top-down-shooter, jetpack, space-invaders) | S–M | One `CooldownDef` + decrement system covers fire-rate **and** i-frames; 4 consumers. |
| 7 | `modules/spawner` | **Build** (new) | 4 (flappy, jetpack, space-invaders, top-down-shooter) | M | Cadence + difficulty-ramp emitter; 4 consumers, solid canon. Directly useful for the next shooter. |
| 8 | `modules/collision` V2 — reflection response | **Build** (extension) | 3 (breakout, local-pong, frogger) | M | Kinematics already does push-out+zero; add the velocity-**reflect** helper for bouncers. |
| 9 | `RenderableDef` text/shape adoption + overlay pass | **Adopt + Build** | 2 (local-pong, snake) | M | Text/rect/circle/polygon already ship (adopt now); the camera-independent **overlay** pass is the genuine new bit. |
| 10 | `modules/camera` V2 — camera-consume + view-rect cull | **Build** (extension) | 2 (rpg, tilemap) | M–L | Renderer goes through the camera transform instead of manual `ctx2d.translate`; the view-rect also feeds off-screen cull. Architectural — also benefits any scrolling next game. |

## Suggested sequencing

1. **Adoption sweep — collapsed on dual-side verification.** What looked
   like cheap adoptions aren't: #1 boundary is already adopted by the 2
   games that fit (the other 5 are the #3 Build); #4 pointer needs the
   `projectPointer` export first (a Build); the old world-reset adopt is
   already done (`clearAll()`). The only *possible* remaining adoption is
   the text/shape half of #9 — **not yet consumer-verified**, so don't
   trust it until both sides are opened.
2. **Small utilities (2, 5).** Pure functions; land + migrate same day.
3. **Small modules (6, 7).** `cooldown` then `spawner` — both 4-consumer,
   both shooter-relevant.
4. **Targeted extensions (3, 8, 10).** The motion boundary inset (#3),
   `collision` reflection (8) and `camera` V2 camera-consume (10) need
   design care; do them when their consumers are next touched.
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
