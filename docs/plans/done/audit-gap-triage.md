# All-examples audit → backlog triage

Reconcile the freshly-merged
[engine-gap-ledger](../roadmap/engine-gap-ledger.md) open rows against
[ecs-module-backlog](../roadmap/ecs-module-backlog.md): for each gap,
**promote** (into a backlog entry, recording the now-met trigger), mark
**resolved** (already shipped + consumers migrated), or **reject** (with
rationale). Then flip each ledger row's **Status**.

This is the *triager* pass the ledger's two-role split prescribes. It
records decisions only — **no module is built here**, and nothing is
marked "scheduled". Deferred-with-trigger-met still respects the
sliding-scale rule-book; building is a separate, later step.

## Decision table

Verified against the shipped engine surface (coverage sweep 2026-07-15).
Several rows that looked like new modules are **already shipped** — they
become *adoption follow-ups* (Bucket-A style: engine has it, example
hand-rolls it), not promotions.

### Already shipped → adoption follow-up (no new module; consumers hand-roll)

`Resolved` requires capability shipped **AND** every consumer migrated.
So this splits in two:

**(a) Ships AND consumers already on it → `Resolved`:**

| Ledger gap (consumers) | Shipped surface | Ledger action |
|---|---|---|
| Component serde boilerplate (asteroids, snake) | `simpleComponent` — **both already use it** | **`Resolved`** (stale) |
| DOM renderer (card-battler) | `modules/render-dom` V1 — driving consumer | **`Resolved`** |
| Circle-vs-AABB *test* | `modules/collision` `aabbVsCircle` | **`Resolved`** + merge into bounce row |

**(b) Ships BUT consumers still hand-roll → stays `Open` + "ships; adoption follow-up" tag (NOT `Resolved`):**

| Ledger gap (consumers) | Shipped surface | Ledger action |
|---|---|---|
| World `reset()`/`clear()` (3) | `world.reset()` | **`Open`** + tag → adoption sweep |
| B4 boundary clamp (4) | `motion boundary:{mode:'clamp'}` | **`Open`** + tag |
| B1a off-screen wrap (subset of B1) | `motion boundary:{mode:'wrap'}` | **`Open`** + tag (folded into B1) |
| B9 pointer→canvas DPI (3) | `PointerProvider.defaultProject` | **`Open`** + tag |
| Text/shape decorations (local-pong, snake) | `RenderableDef` `text`/`rect`/`circle`/`polygon` | **`Open`** + tag; only overlay-pass promotes (below) |
| Two-player input (local-pong) | two `createInput`s work | **`Open`** + tag; slot abstraction stays Speculative |

Net effect of this section: **3 rows → `Resolved`, 0 new backlog entries, ~6 rows stay `Open` re-tagged "ships — adoption follow-up."**

### Genuinely missing → promote

| Ledger gap (consumers) | Decision | Backlog target |
|---|---|---|
| Continuous→grid projection (3) | **Promote** — trigger met | `ContinuousHashGrid2D` (record 3rd consumer) |
| B1c cull off-screen from render (tilemap +) | **Promote** | render-canvas2d viewport cull + `camera` V2 view-rect |
| Collision **reflection/bounce** response (breakout, local-pong, frogger = 3) | **Promote** | `modules/collision` V2 — reflection (kinematics already does push-out+zero; reflection ≠ zero) |
| Rider/carrier (frogger) + follower (asteroids, space-invaders) = **3** | **Promote (un-decline)** | NEW `modules/attach` (follow/carrier) — re-opens *Declined* hierarchy in lighter form |
| B2 spawn cadence + ramp (4) | **Promote** | NEW `modules/spawner` |
| B3 cooldown/grace timer (4) | **Promote** | NEW `modules/cooldown` |
| B13 velocity normalize/set-speed (2) | **Promote** | extend `modules/motion` — vector util (B5 is the separate collision-reflection row) |
| B6 Fisher–Yates shuffle + random-pick (3) | **Promote** | NEW `modules/rng` (shuffle + pick + optional seed) |
| B7 discrete grid movement & snapping (3) | **Promote** | NEW `modules/grid-movement` (grid-based is FOV/LOS, *not* movement) |
| B8 particle/burst (4) | **Promote** — trigger met | `modules/particles` (record met) |
| B15 tilemap→entity auto-spawn + collision-derivation (2) | **Promote** — trigger met | `modules/tilemap` (record met) |
| Renderer doesn't consume camera transform (rpg, tilemap = 2) | **Promote** | `camera` V2 + render-canvas2d camera-consume |
| Renderer screen-space **overlay** pass (local-pong, snake = 2) | **Promote** | `RenderableDef` V3 — camera-independent overlay pass |
| Sprite renderer ignores GID flip bits (2) | **Promote** | render-canvas2d — honour flip flags (tmx already exposes them) |

### Hold / Defer / Reject

| Ledger gap (consumers) | Decision | Note |
|---|---|---|
| Tag-change reactive events (1) | **Hold (Open)** | core query reactivity — speculative |
| Composite multi-drawable (flappy, 1) | **Hold** | `RenderableDef` V3 composite — 1 consumer |
| 3D transforms / `HashGrid3D` (1 each) | **Defer** | 3D siblings (exists) |
| B10 zone/pile move + B11 drag-drop (2 each) | **Hold (Open)** | card-interaction — genre-clustered |
| B17 steering/seek AI (2) | **Defer** | `modules/ai` (record 2; contested / rule-of-three) |
| B18 sprite-animation FSM (1) | **Defer** | `modules/animation` (deferred; ship needs ≥2) |
| B19 two-player slot abstraction (1) | **Defer** | local-multiplayer player-slot |
| B21 rhythm timing stack (1) | **Defer** | NEW speculative `modules/rhythm` |
| hub app-host (1) | **Defer** | NEW speculative app-host helper |
| B14 scoring/lives/game-over | **Reject** | Non-goals — content, not engine |

## Subtasks

- [x] Backlog: record met triggers on `ContinuousHashGrid2D`, `particles`, `animation`, `tilemap`.
- [x] Backlog: un-decline parenting → add `modules/attach` (follow/carrier) deferred entry; keep the full-hierarchy decline note, narrowed.
- [x] Backlog: author new entries — `modules/spawner`, `modules/cooldown`, `modules/grid-movement`, `modules/rng`, `modules/collision` V2 (reflection), `modules/motion` vector-util note, `modules/rhythm` (spec), app-host (spec).
- [x] Backlog: add render-canvas2d V3 notes — viewport cull, camera-consume, overlay pass, flip-honour (text/shapes already ship).
- [x] Ledger: flip Status per row — Resolve the stale-shipped rows (serde, world.reset, pointer-DPI, DOM renderer, circle-test), mark adoption-pending rows (clamp/wrap), Promote the genuine-missing, Reject scoring.
- [ ] Peer review both docs.
- [ ] Move this plan to `done/`; commit (with permission).

## Verified-shipped surface (so triage doesn't re-promote what exists)

- `modules/motion` `makeVelocityIntegrationSystem({boundary:{mode:'wrap'|'clamp'}})` — wrap + clamp.
- `modules/kinematics` `makeKinematicsSystem` — axis-separated push-out + velocity-zero (NOT reflection).
- `modules/input` `PointerProvider.defaultProject` — DPI/CSS client→canvas scaling.
- `src/world.ts` `reset()` — drains stores + spatial, rewinds ids (silent).
- `RenderableDef` union — `text` / `rect` / `circle` / `polygon` already ship.
- `modules/tmx` `gidToFrame` + `splitGidFlags` — flip bits parsed (renderer just doesn't apply them).
- `modules/camera` `worldToView` / `viewToWorld` — transforms exist; renderer doesn't take a camera.
- `simpleComponent` / `registryComponent` — auto serde.

## Guardrails

- Nothing here authorises building. Promoted = "has a backlog home + a
  met trigger"; the build decision is still a separate explicit step.
- New entries follow the doc's existing **Scope / Trigger / Canon**
  shape — concise, not full plans.
- Don't mark anything ✅ Shipped.
