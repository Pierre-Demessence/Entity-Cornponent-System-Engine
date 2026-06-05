# Local → Engine Migration — Top 10

Prioritized worklist for pulling hand-rolled example code into the engine
before the next prototype. Sourced from the
[engine-gap-ledger](engine-gap-ledger.md) triage (2026-07-15, exhaustive
source-cited pass) and the [module backlog](ecs-module-backlog.md).

> **Re-cited 2026-07-15 against the stamped ledger.** Two pre-correction
> entries were wrong and are fixed below: the old #3 `world.reset()` was a
> phantom (the API is `clearAll()`@[`world.ts:103`](../../src/world.ts) and
> every consumer already calls it — nothing to migrate), and the old #1
> "adopt boundary for ~10" was mis-scoped (the shipped clamp pins only an
> *origin point* to `[0,width]`, so size-aware clampers need a Build, not an
> adopt). See the ledger's world-reset and B4 rows.

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
| 1 | Motion boundary `wrap` + `clamp` (full-playfield, point) | **Adopt** (`modules/motion`) | 4 (asteroids, top-down-shooter point-clamp; flappy, jetpack wrap) | S | `boundary:{mode}` ships ([motion.ts:51](../../src/modules/motion/motion.ts)) but clamps the **origin point** to `[0,width]×[0,height]` only. Full-playfield clampers + wrappers adopt as-is; delete the hand-rolled edge logic. |
| 2 | `modules/rng` — shuffle / pick / seed | **Build** (new util) | 3 (card-battler, solitaire, snake) | S | Pure functions, no ECS coupling, trivial to land; unblocks deterministic tests too. |
| 3 | Motion boundary **inset / per-entity size** extension | **Build** (`modules/motion` ext) | 4 (breakout paddle, frogger, local-pong, space-invaders) | S–M | The shipped clamp pins a *point* to `[0,width]`; size/margin-aware clampers need `[inset, width−inset]` or half-extent bounds. Extend `VelocityIntegrationBoundary`@[`motion.ts:15`](../../src/modules/motion/motion.ts) with an inset/half-size. (Replaces the old phantom `world.reset()` row.) |
| 4 | `PointerProvider.defaultProject` (DPI) | **Adopt** (`modules/input`) | 3 (breakout, solitaire, tilemap) | S | Ships already; drop the hand-rolled client→canvas DPI math. |
| 5 | `modules/motion` vector util (normalize / set-speed) | **Build** (extension) | 2 (breakout, top-down-shooter) | S | One `hypot` helper; pairs naturally with #1 in the same motion pass. |
| 6 | `modules/cooldown` | **Build** (new) | 4 (asteroids, top-down-shooter, jetpack, space-invaders) | S–M | One `CooldownDef` + decrement system covers fire-rate **and** i-frames; 4 consumers. |
| 7 | `modules/spawner` | **Build** (new) | 4 (flappy, jetpack, space-invaders, top-down-shooter) | M | Cadence + difficulty-ramp emitter; 4 consumers, solid canon. Directly useful for the next shooter. |
| 8 | `modules/collision` V2 — reflection response | **Build** (extension) | 3 (breakout, local-pong, frogger) | M | Kinematics already does push-out+zero; add the velocity-**reflect** helper for bouncers. |
| 9 | `RenderableDef` text/shape adoption + overlay pass | **Adopt + Build** | 2 (local-pong, snake) | M | Text/rect/circle/polygon already ship (adopt now); the camera-independent **overlay** pass is the genuine new bit. |
| 10 | `modules/camera` V2 — camera-consume + view-rect cull | **Build** (extension) | 2 (rpg, tilemap) | M–L | Renderer goes through the camera transform instead of manual `ctx2d.translate`; the view-rect also feeds off-screen cull. Architectural — also benefits any scrolling next game. |

## Suggested sequencing

1. **Adoption sweep (#4 pointer + the full-playfield half of #1 +
   text/shape half of #9).** One pass, no new engine surface — migrate
   examples onto what already ships and flip the corresponding ledger
   rows to `Resolved`. (The old world-reset adopt is already done —
   `clearAll()` ships and is adopted; nothing left to sweep there.)
   Fastest ledger cleanup.
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
