# Example Engine-Gap Audit (all 18 examples)

> One read-only subagent swept each example for logic hand-rolled locally that
> arguably belongs in `@pierre/ecs`. Reporting bias was deliberately **generous**
> ("better to over-report and triage down"). This doc is the triage worksheet:
> mark each cluster **KEEP** (promote/migrate) or **DROP** (not engine-worthy).
>
> Scope: asteroids, breakout, card-battler, flappy, frogger, hub, jetpack,
> local-pong, platformer, platformer-3d, rhythm, rpg, snake, solitaire,
> space-invaders, tilemap, top-down-shooter (+ frogger re-swept for parity).
>
> Status: **partially actioned.** Bucket A adoption migrations (A1/A2/A6/A8)
> are done; A3/A5/A7 reclassified (see notes); Bucket B/C await triage.

> ✅ **Ledger corrected:** `engine-gap-ledger.md`'s collision rows previously
> claimed *"Engine ships `circleVsCircle` only"* — wrong; `aabbVsAabb`,
> `aabbVsCircle` and `aabbVsAabbSwept` all exist in
> [`src/modules/collision/narrowphase.ts`](../../src/modules/collision/narrowphase.ts).
> Those rows now strike the stale text and carry a real lifecycle status
> (AABB-vs-AABB **Resolved**, Circle-vs-AABB **Open**). The real gap (A1 below)
> was **adoption**, not a missing primitive.

## Bucket A — Adoption gaps (primitive EXISTS, example reinvents)

Each primitive below is **verified present in source** (path in the "Engine
primitive" column). The examples reimplement it by hand anyway. Remediation =
migrate the example to the engine primitive (+ improve docs/discoverability). No
new engine surface required — except A4, which is only half-shipped.

| # | Gap | Engine primitive (verified) | Consumers reinventing it | Confidence |
| --- | --- | --- | --- | --- |
| A1 | Rect/circle overlap test | `aabbVsAabb`, `aabbVsCircle`, `aabbVsAabbSwept` — [`collision/narrowphase.ts`](../../src/modules/collision/narrowphase.ts) | local-pong, flappy (`circleVsRect`), frogger, jetpack, space-invaders | **STRONG** — ✅ **DONE** (all 5 migrated; breakout excluded — see note) |
| A2 | TTL/lifetime despawn | `LifetimeDef`+`makeLifetimeSystem` — [`lifetime/lifetime.ts`](../../src/modules/lifetime/lifetime.ts) | frogger, jetpack, space-invaders, top-down-shooter | **STRONG** — ✅ **DONE** (frogger/jetpack/space-invaders migrated; top-down-shooter already used it) |
| A3 | High-score persistence | `save` module — `src/modules/save/` | breakout, jetpack, frogger, flappy, snake (raw `localStorage`) | ~~STRONG~~ → **NOT AN ADOPTION GAP** (see note) |
| A4 | Spatial grid **birth/death** sync | `makeGridSyncOnMove` — [`spatial/grid-sync.ts`](../../src/modules/spatial/grid-sync.ts) (move only — **half**) | asteroids, platformer, top-down-shooter, rpg | **STRONG** (half-shipped) |
| A5 | Camera follow / world↔view xform | `makeFollowCameraSystem`, `worldToView`/`viewToWorld` — [`camera/camera.ts`](../../src/modules/camera/camera.ts) | tilemap (CSS transform), top-down-shooter (unused), rpg (manual clamp) | ~~MEDIUM~~ → **NOT AN ADOPTION GAP** — capability gaps logged in ledger (see note) |
| A6 | Action-mapped input + edges | `input` module | rpg (raw DOM keyboard), jetpack (raw pointer) | **MEDIUM — REAL** — ✅ DONE (jetpack pointer + rpg keyboard migrated) |
| A7 | Canvas2D renderer | `render-canvas2d` | local-pong, snake (raw `ctx2d` calls) | ~~MEDIUM~~ → **NOT AN ADOPTION GAP** — capability gap logged in ledger (see note) |
| A8 | Texture-atlas XML / tmx auto-spawn | `texture-atlas`, `tmx` | solitaire (atlas) | **MEDIUM — REAL** for solitaire only — ✅ DONE (solitaire atlas migrated; rpg+tilemap already adopt tmx; spawn-by-hand is by design) |

> A4 is genuinely **half-shipped**: the engine syncs grid cells on *movement* but
> the example must still `grid.add()` on spawn and `grid.remove()` on despawn by
> hand. A lifecycle hook (auto add/remove on entity create/destroy) closes it.

> **A1 scope note — breakout excluded.** The engine-gap-ledger lists a 6th
> collision consumer, **breakout**, which this row's "all 5" does *not* cover.
> breakout fuses the overlap *test* with a push-out *response* (expanded-AABB /
> Minkowski form), so it isn't a clean test-helper adoption; its real need is the
> separate **bounce/reflection response** gap, still **Open** in the ledger. The
> ledger's Circle-vs-AABB row therefore stays Open (flappy migrated, breakout
> deferred) — consistent with this row once breakout is read as a response
> consumer, not a test consumer.

> **A3 reclassified — not a real adoption gap.** All five examples persist a
> single high-score *integer*. The `save` module is async (`Promise`-based) and
> built for *versioned* saves — migration chains, checksum envelopes, backup
> rotation, orphan recovery — none of which a lone scalar exercises. Wrapping
> `localStorage.getItem('highscore')` in async checksum envelopes is
> over-engineering and would set a poor example. Raw `localStorage` is the
> correct tool here. A *real* save-module consumer should come from a future
> example with an actual multi-field versioned save (settings + progression +
> unlocks + schema version) that exercises migrations — tracked as a Bucket-B /
> roadmap item, not a mechanical adoption migration.

> **A5 reclassified — not a real adoption gap.** On inspection none of the three
> listed consumers is a genuine miss: **rpg** *already* uses
> `makeFollowCameraSystem` + `CameraDef` (with an app-level scroll clamp, which
> the module intentionally leaves to the caller). **tilemap** is an interactive
> drag-pan + wheel-zoom *viewer* — the camera module is a *follow* camera with
> zoom and free pan explicitly out of scope, so it's the wrong primitive; the
> CSS-transform pan/zoom is correct. **top-down-shooter** renders in pure screen
> space (fixed single-screen arena, player clamped to `SCREEN_W/H`) — there is no
> camera and none is needed. A real second camera consumer should come from a
> future scrolling example that follows a target without needing zoom/free-pan.
>
> **But the underlying capability gaps are real and now logged.** Two distinct
> engine-capability gaps (not adoption gaps) sit beneath A5. The renderer's
> failure to consume a camera/view transform is logged as its own row in the
> [engine-gap-ledger](engine-gap-ledger.md) — rpg runs `makeFollowCameraSystem`
> then *still* hand-writes `ctx2d.translate(...)`. tilemap's need for a
> free-pan/zoom camera variant is noted *within* that same ledger row (not a
> separate row). The Unity/Godot model is: world rendering always goes through
> the camera transform.

> **A7 reclassified — not a clean adoption gap.** `local-pong` and `snake` draw
> their *entities* (paddles/ball, food/segments) with raw `ctx2d.fillRect`, which
> the entity-iterating `render-canvas2d` module could replace. But both also draw
> **static, non-entity decorations** every frame — pong's court border, dashed
> center net, decorative circle, score labels; snake's wall border and game-over
> overlay — which the component-driven renderer cannot express. A partial
> migration (entities via the module, decorations still hand-drawn) is possible
> but mixes two render paths for marginal benefit. So this is **not an adoption
> gap** — but it *is* a real engine-capability gap, now logged in the
> [engine-gap-ledger](engine-gap-ledger.md): the renderer can't express
> non-entity decorations, text/labels, or screen-space overlays. The Unity/Godot
> fix is a separate screen-space UI/overlay layer plus text & shape renderables.

---

## Bucket B — Missing primitives (genuinely absent)

Ranked by consumer count (the sliding-scale promotion signal). Remediation =
consider a new core util or module.

### STRONG (3+ consumers, domain-neutral)

| # | Gap | Consumers | Note |
| --- | --- | --- | --- |
| B1 | **Off-screen / boundary recycling & culling** | flappy, jetpack, asteroids, frogger (wrap), top-down-shooter, tilemap (cull) | 6 consumers. "Despawn or wrap entities that leave a region." Most-recurring missing primitive in the whole sweep. |
| B2 | **Spawn timer / cadence with difficulty ramp** | flappy, jetpack, space-invaders, top-down-shooter | "Emit entity every T ms, T lerps with difficulty." |
| B3 | **Cooldown / debounce / grace timer** | asteroids (fire), top-down-shooter (fire), jetpack (bullet), space-invaders (invuln) | A `CooldownDef` + auto-decrement system covers fire-rate AND i-frames. |
| B4 | **Boundary clamp (constrain entity to region)** | flappy, jetpack, breakout, rpg | Clamp position to bounds + zero velocity on breach. |
| B5 | **Collision reflection / bounce response** | breakout (ledgered), local-pong, frogger (partial) | The *response* (push-out + velocity flip on min-penetration axis), distinct from the overlap *test*. |
| B6 | **Fisher–Yates shuffle + random-pick-from-tag** | card-battler, solitaire, snake (`randomEmptyCell`) | Pure utility; trivially domain-neutral. |
| B7 | **Discrete grid/tile movement & snapping** | snake, frogger, rpg | Step-on-tick, snap-to-cell, occupancy query, 180°-reversal guard. |
| B8 | **Particle system / radial burst** | frogger, jetpack, space-invaders, asteroids | Each hand-rolls `spawnParticle` + radial `burst()`. |

### MEDIUM (2–3 consumers, or borderline content)

| # | Gap | Consumers | Note |
| --- | --- | --- | --- |
| B9 | Pointer→canvas DPI coordinate transform | breakout, solitaire, tilemap | DPI-aware client→world mapping; recurs in every pointer game. |
| B10 | Zone/pile tag-move management | card-battler, solitaire | hand↔deck↔discard / stock↔waste tag swaps. |
| B11 | Drag-and-drop hit-testing (DOM + canvas) | card-battler, solitaire | reverse hit-test + legal-drop predicate. |
| B12 | Child/parent follower transform sync | asteroids (thrust flame), space-invaders | "entity B tracks entity A's pos/rot each frame." |
| B13 | Velocity normalize / set-speed-in-direction | breakout, top-down-shooter | `hypot` rescale to target magnitude. |
| B14 | Scoring / lives / game-over scaffold | nearly all | borderline — may be content, not engine. |
| B15 | Tilemap auto-spawn + flip-flags + collision-from-tilemap | rpg, tilemap | `tmx` parses but examples instantiate entities, decode flip bits, and derive walkability by hand. |

### SPECULATIVE (1–2 consumers / genre-specific)

| # | Gap | Consumers | Note |
| --- | --- | --- | --- |
| B16 | Carried/attached moving-platform rider kinematics | frogger (ledgered) | inherit carrier velocity each tick. |
| B17 | Steering / seek AI | top-down-shooter, card-battler (intent) | constant-speed seek; no separation/pathfinding. |
| B18 | Sprite animation state machine | rpg | idle→walk→attack frame cycling. |
| B19 | Two-player local input mapping | local-pong | per-player `InputState` + key routing. |
| B20 | 3D transform / spatial / narrowphase / camera | platformer-3d (ledgered) | engine is 2D; 3D example re-does the lot. |
| B21 | Rhythm timing stack | rhythm | audio-clock `TickSource`, hit-window judgement, lookahead/absolute-time spawn, timestamped input queue, latency comp. Genre but real & cleanly built. |

---

## hub (launcher, not a game)

Worth noting as a possible thin "app-host" helper, low priority:

- `start(container) => Teardown` mount/unmount contract every example re-implements.
- Lazy-load race guard (stale-load token / CAS) when switching examples.
- Mount → cleanup → async-load → wire-teardown orchestration boilerplate.

---

## Suggested triage order

1. ~~**Fix the stale ledger row** (A1) — factual correction, do regardless.~~
   ✅ Done — collision rows corrected (status now Resolved/Open).
2. **Decide adoption-gap policy** (Bucket A): migrate examples to existing
   primitives + add a "use these, don't hand-roll" note in
   [`extending-the-engine.md`](../extending-the-engine.md). A4 also needs a small
   engine addition (birth/death grid lifecycle hook).
3. **Promote the STRONG missing primitives** (B1–B8) through the sliding-scale
   rule — B1/B2/B3 already clear the multi-consumer bar today.
4. Park MEDIUM/SPECULATIVE as backlog candidates pending a 2nd/3rd consumer.
