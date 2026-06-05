# Engine Gap Ledger

Single source of truth for **engine gaps** surfaced while building the
[`examples/`](../../examples/). A gap is something `@pierre/ecs` *lacked*
that an example had to hand-roll locally, or an existing engine surface
that had to be extended before an example could be built. Recording every
gap here, in one place, gives the "how many consumers hit this?" question
a real answer.

This is the **raw** ledger. Deciding which gaps become engine
modules — and where — happens separately, in
[`ecs-module-backlog.md`](ecs-module-backlog.md), during a triage pass.

## How this works

Two roles, deliberately separated (see
[extending-the-engine.md](../extending-the-engine.md)):

### Gap writer — just built an example

List the gaps you hit. **Symptom only — do not decide what module a gap
becomes.** That decision biases toward your one game's shape, which is
exactly what we keep out of the writer's hands.

- If a matching row already exists, add your example to its **Consumers**
  list (you're saying "I hit the same wall", not making a module call).
- Otherwise add a new row.
- Record how you handled it. **You can always build the example without
  touching the engine** — so the choice is governed by canon, not by
  whether a module already exists:
  - **Kept local (default).** You hand-rolled the missing piece in the
    example and touched nothing in the engine. Add it to the
    [open gaps](#open-gaps-awaiting-triage) table. This is the right call
    unless the capability is established canon.
  - **Promoted.** The capability was clearly canon (standard — the engine
    *ought* to have it), so you added a primitive or extended an existing
    module under the sliding-scale rule. Record it under
    [resolved during the build](#resolved--canon-promoted-during-the-build).
    Extending an existing module counts here too: it carries the **same
    bar** as adding a new one — "a module already exists" is not a licence
    to put a non-standard one-off into it.

### Gap triager — separate pass

Read the open gaps, group related ones, and apply the sliding-scale
promotion rule in [extending-the-engine.md](../extending-the-engine.md).
For each gap (or group): promote it into a
[`ecs-module-backlog.md`](ecs-module-backlog.md) entry, or reject it with
a recorded rationale. Update the gap's **Status** here when you do.

## Status vocabulary

- **Open** — recorded, kept local, not yet triaged.
- **Promoted** — triager moved it into `ecs-module-backlog.md` (or it
  shipped). Link the backlog entry / module.
- **Resolved** — the gap is closed: either a canon capability was
  promoted/extended during the build that surfaced it, *or* the
  capability already shipped and every listed consumer has since been
  migrated to it (migration tracked in
  [example-engine-gap-audit.md](../archived/example-engine-gap-audit.md)).
- **Rejected** — triager declined; rationale recorded.

## Verification provenance (read before trusting any row)

Every row carries a **Verified @ src** stamp: the exact `file@line` that
was opened to confirm the claim, plus whether the capability is `PRESENT`
or `ABSENT`. This exists because three earlier triage/report passes each
carried forward ~half-false claims — the failure mode was *inferring* a
gap from "an example hand-rolls X" without opening the engine source, then
laundering that inference into more confident downstream docs. The fix is
structural, not "verify harder":

- A row may only assert a gap with a source citation. **No citation → the
  claim is not trustworthy and must be re-verified before acting.**
- The stamp records the API **shape**, not just the capability name — e.g.
  "boundary clamps to `[0,width)` only, no inset", because the
  fit-determining detail lives in the signature, not in prose.
- **Adoption claims need TWO citations, not one.** An "X can adopt Y /
  X is a clean migration / N consumers fit" claim is a **join of two
  facts**: (1) the engine capability's shape, and (2) each consumer's
  *actual* usage. A stamp that points only at `src/modules/...` proves
  the capability exists, **not** that any consumer fits it. So every
  adopt/fit/clean-swap row must carry an engine `file@line` **and**, per
  named consumer, that example's `file@line`. This rule cost the 4th pass
  a re-do: it stamped only the engine side and still listed "flappy,
  jetpack **wrap**" as boundary adopters — opening their `systems.ts`
  showed size-aware clamps, not wrap (see B4). Capability-exists ≠
  consumer-fits.
- "ships-but-unadopted" (capability `PRESENT`, consumers hand-roll) is
  recorded distinctly from "genuinely missing" (`ABSENT`). The first is an
  **adoption** follow-up; only the second can justify a new module. And
  "ships-but-**module-private** / wrong-shape-to-adopt" (e.g. the pointer
  projector, B9) is a **Build**, not an adoption — verify the export
  surface, not just that the logic exists somewhere.
- Last exhaustive source-cited pass: **2026-07-15** (every row opened);
  boundary + pointer rows re-verified **dual-sided** (engine + consumer)
  the same day after the single-sided miss above.

## Gap tally (grouped by status)

One table per status, so the actionable rows (**Open**, **Promoted**)
sit at the top and the closed ones (**Resolved**, **Rejected**) don't
drown them. The **Consumers** column is the live tally that feeds the
[promotion rule](../extending-the-engine.md); **Verified @ src** is the
provenance stamp (see above). Rows tagged `(audit Bn)` came from the
one-time cross-sectional [examples audit](../archived/example-engine-gap-audit.md);
the rest were grown incrementally. (The two were a single table merged
2026-07-15 — there was no structural reason to keep them apart.)

### Open — recorded, not yet triaged

| Gap (symptom) | Consumers | Verified @ src (2026-07-15) | Notes |
|---|---|---|---|
| Entity-lifecycle / tag-change events. No reactive hook, so consumers walk every entity every frame to detect tag (zone) changes. | card-battler | **ABSENT (tags only)**: `LifecycleEvent`@[`lifecycle.ts:13`](../../src/lifecycle.ts) = `EntityCreated/Destroyed/ComponentAdded/ComponentRemoved` — **no `TagAdded/TagRemoved`**. A zone modeled as a *component* WOULD get a reactive hook; card-battler models zones as *tags*, which don't emit. | **Hold** — 1 consumer, speculative; no backlog entry yet. Cheaper workaround on record: model zones as components. |
| Composite / multi-drawable renderable. `Renderable` is one drawable per entity, so multi-part sprites (pipe pairs) are hand-drawn instead of using the renderer. | flappy | **ABSENT** (composite): `Renderable`@[`renderable.ts`](../../src/modules/render-canvas2d/renderable.ts) is a single discriminated union (one `kind` per entity); no multi-drawable form. | **Hold** — 1 consumer; `RenderableDef` V3 composite, no entry yet. |
| Pointer → canvas DPI coordinate transform — DPI-aware client→world mapping. | breakout, solitaire, tilemap | **PRESENT but not adoptable as-is — dual-cited 2026-07-15.** Engine: the projection ships only as the **module-private** `defaultProject`@[`input/pointer-provider.ts:140`](../../src/modules/input/pointer-provider.ts); `PointerProvider` is a stateful, tick-read `InputProvider`, not a pure fn. Consumers project at **event-time**: breakout@[`main.ts:103`](../../examples/breakout/src/main.ts) + solitaire@[`main.ts:146`](../../examples/solitaire/src/main.ts) replicate `defaultProject` exactly; tilemap@[`main.ts:119`](../../examples/tilemap/src/main.ts) is viewport-drag (custom project); space-invaders@[`main.ts:115`](../../examples/space-invaders/src/main.ts) is no-DPI half-screen. | **Build, not adopt.** Export a pure `projectPointer(ev,target)` → then breakout+solitaire adopt that one fn. Adopting the whole provider = arch+timing change. Prior "clean adoption" was *single-sided* (never opened the consumers). Backlogged as `modules/input` pure `projectPointer` export. (audit B9) |
| Zone/pile tag-move management — hand↔deck↔discard / stock↔waste tag swaps. | card-battler, solitaire | **ABSENT**: no helper; tag swaps hand-rolled. | **Hold** — 2 consumers, genre-clustered (card-interaction); no entry yet. (audit B10) |
| Drag-and-drop hit-testing (DOM + canvas) — reverse hit-test + legal-drop predicate. | card-battler, solitaire | **ABSENT**: no helper. | **Hold** — 2 consumers, genre-clustered (card-interaction); no entry yet. (audit B11) |
| Two-player local input mapping — per-player `InputState` + key routing. | local-pong | **PRESENT** (building block): `createInput`@[`input/input-state.ts:40`](../../src/modules/input/input-state.ts) — two instances already route two players; only a player-slot *abstraction* is missing. | Two `createInput`s already work (adoption); slot abstraction → backlog local-multiplayer player-slot (speculative). (audit B19) |

### Promoted — moved into the backlog (or shipping)

| Gap (symptom) | Consumers | Verified @ src (2026-07-15) | Notes |
|---|---|---|---|
| Continuous coordinates → grid-cell projection. `HashGrid2D` keys on integer cells, so consumers hand-roll `cellOf(x,y)` + grid-sync (`onMove`/`indexStatic`) boilerplate. | asteroids, platformer, top-down-shooter | **ABSENT** (continuous variant): only `HashGrid2D`@[`spatial/hash-grid-2d.ts:27`](../../src/modules/spatial/hash-grid-2d.ts); no `ContinuousHashGrid2D` in `spatial/`. | **Trigger met (3rd+ consumer).** → backlog `ContinuousHashGrid2D(cellSize)`. |
| Sprite renderer ignores GID flip/rotation bits. Consumers unpack flip bits from the GID but the renderer doesn't apply them, so flipped tiles render unflipped. | tilemap, rpg | **Split**: unpacking **PRESENT** (`splitGidFlags` + `TMX_FLIP_H/V/D`@[`tmx/tmx.ts:158`](../../src/modules/tmx/tmx.ts)); renderer-honour **ABSENT** — `drawEntity` sprite path@[`canvas2d-renderer.ts:121`](../../src/modules/render-canvas2d/canvas2d-renderer.ts) calls `drawImage` with no flip transform. | rpg added flip-flag *unpacking*; the renderer still doesn't honour them. → backlog render-canvas2d V3 (honour flip flags). |
| Collision bounce/reflection response. Engine has no helper to resolve a circle-vs-AABB overlap into a corrected position + reflected velocity, so consumers hand-roll axis-of-least-penetration reflection. | breakout, local-pong, frogger (partial) | **ABSENT** (reflection): no `reflect`/`bounce` in `collision/`; `kinematics-system.ts` does axis-separated push-out + `vel.vx=0`@:119 / `vel.vy=0`@:149 (zero, **not** flip). | → backlog `modules/collision` V2 (reflection). reflection ≠ zero. This is the *response* (push-out + velocity flip on smaller-penetration axis). (audit B5) |
| Carried / attached moving-platform rider kinematics. No engine parenting/attachment, so a rider that should inherit a moving platform's velocity per tick (frog on a log/turtle) hand-adds the platform's `vx * dt` to its own position each frame. | frogger | **ABSENT**: no `modules/attach` in the module tree. | → backlog NEW `modules/attach` (follow/carrier). With the B12 follower row = 3 consumers → un-declines the hierarchy item in lighter form. Would also serve one-way platforms / conveyor belts. |
| 3D transform components. `PositionDef` / `VelocityDef` / `GroundedDef` are 2D-only; 3D consumers redefine them locally. | platformer-3d | **ABSENT**: `transform/index.ts` exports only 2D `Position/Rotation/Scale/Velocity` — no `Position3D`/`Velocity3D` (README mentions `{x,y,z}` aspirationally; not exported). | **Defer** → backlog "3D siblings (speculative)". |
| 3D spatial structure (`HashGrid3D`). No 3D broadphase, so consumers brute-force collision checks. | platformer-3d | **ABSENT**: `spatial/` ships `HashGrid2D` only. | **Defer** → backlog "3D siblings (speculative)". |
| Renderer doesn't consume a camera/view transform. `Canvas2DRenderer` draws entities in raw world coords, so a scrolling/zooming world hand-writes `ctx2d.translate(...)` even when a `CameraDef` already exists. | rpg, tilemap | **ABSENT**: `drawEntity`@[`canvas2d-renderer.ts:73`](../../src/modules/render-canvas2d/canvas2d-renderer.ts) draws at raw `pos.x/pos.y` (its `translate`/`scale` are per-entity local only); README:178 *"camera (reserved for `modules/camera`)"*. `camera` ships `worldToView`/`viewToWorld` but the renderer never calls them. | → backlog `camera` V2 + render-canvas2d camera-consume. Pairs with the camera module's missing free-pan/zoom variant (tilemap). See [audit](../archived/example-engine-gap-audit.md) A5. |
| Renderer can't express non-entity decorations, text, or screen-space overlays. Static chrome (court net, borders), score/HUD text, and full-screen overlays (game-over panels) are hand-drawn with raw `ctx2d`. | local-pong, snake | **Split**: text/shape **PRESENT** (`Renderable` union has `text`/`rect`/`circle`/`polygon`@[`renderable.ts`](../../src/modules/render-canvas2d/renderable.ts)); overlay-pass **ABSENT** — README:92 shows `drawHud(ctx2d, state)` is consumer-owned; no camera-independent screen-space layer. | Text/shape half = adoption. Genuine gap = camera-independent **overlay pass** → backlog `RenderableDef` V3 overlay. See [audit](../archived/example-engine-gap-audit.md) A7. |
| Off-screen / boundary recycling & culling — despawn-or-wrap entities that leave a region; cull off-screen entities from update/render. | flappy, jetpack, asteroids, frogger (custom span-wrap), top-down-shooter, tilemap (cull) | **wrap/clamp capability PRESENT** (`applyBoundary`@[`motion/motion.ts`](../../src/modules/motion/motion.ts), `boundary:{mode}`) — note only asteroids/top-down-shooter actually *adopt* it; frogger hand-rolls a span-recycle (see boundary row); **despawn** trivial (`lifetime` + `queueDestroy`); **render cull ABSENT** (viewport reserved for `camera`, README:178). | **Split.** Genuine gap = **cull off-screen from render** → backlog `camera` V2 view-rect + render-canvas2d viewport cull. (audit B1) |
| Spawn timer / cadence with difficulty ramp — "emit an entity every T ms, where T lerps with difficulty." | flappy, jetpack, space-invaders, top-down-shooter | **ABSENT**: no `modules/spawner`. | → backlog NEW `modules/spawner` (cadence + ramp). (audit B2) |
| Cooldown / debounce / grace timer — a `CooldownDef` + auto-decrement system covering fire-rate AND invulnerability i-frames. | asteroids (fire), top-down-shooter (fire), jetpack (bullet), space-invaders (invuln) | **ABSENT**: no `modules/cooldown`. | → backlog NEW `modules/cooldown`. (audit B3) |
| Boundary clamp / wrap — constrain an entity to a region (clamp/wrap position + zero velocity on breach). | flappy, jetpack, frogger, local-pong, space-invaders (+ asteroids, top-down-shooter adopted) | **PARTIAL — dual-cited 2026-07-15.** Engine: `boundary:{mode}` pins the origin to `[0,width)` only (`makeVelocityIntegrationSystem`@[`motion.ts:56`](../../src/modules/motion/motion.ts), clamp branch @:51; `Bounds={width,height}`@:7 — no inset/size). Consumers (opened): **adopt** = asteroids@[`main.ts:43`](../../examples/asteroids/src/main.ts) (wrap), top-down-shooter@[`main.ts:164`](../../examples/top-down-shooter/src/main.ts) (clamp). **Size/span-aware, can't adopt** = flappy@[`systems.ts:113`](../../examples/flappy/src/systems.ts) (±BIRD_R), jetpack@[`systems.ts:122`](../../examples/jetpack/src/systems.ts) (CEIL/FLOOR−PLAYER_H), frogger@[`systems.ts:118`](../../examples/frogger/src/systems.ts) (±span recycle, **not** an origin wrap), local-pong@[`systems.ts:89`](../../examples/local-pong/src/systems.ts) (margin+size), space-invaders@[`systems.ts:65`](../../examples/space-invaders/src/systems.ts) (SIDE_MARGIN+PLAYER_W). | **Resolved-adopt + Build.** The 2 full-playfield games already adopt; the other 5 are the **inset Build** (backlog `modules/motion` boundary inset). **No clean adoption left.** The earlier "adopt flappy/jetpack **wrap**" was a *single-sided* (engine-only) claim — opening the consumers shows size-aware clamps, not wrap. (audit B4) |
| Discrete grid/tile movement & snapping — step-on-tick, snap-to-cell, occupancy query, 180°-reversal guard. | snake, frogger, rpg | **ABSENT**: no `modules/grid-movement`; `grid-based/` is `visibility.ts` (FOV/LOS) only. | → backlog NEW `modules/grid-movement`. (audit B7) |
| Particle system / radial burst — each consumer hand-rolls `spawnParticle` + radial `burst()`. | frogger, jetpack, space-invaders, asteroids | **ABSENT**: no `modules/particles`. TTL ships (`lifetime`). | **Trigger met (4 consumers).** → backlog `modules/particles` (emitter/burst). (audit B8) |
| Child/parent follower transform sync — "entity B tracks entity A's pos/rot each frame." | asteroids (thrust flame), space-invaders | **ABSENT**: no `modules/attach`. | → backlog NEW `modules/attach` (with the frogger rider row = 3 consumers). pos/rot follow vs velocity inheritance — same module. (audit B12) |
| Tilemap → entity auto-spawn + collision-layer derivation. `tmx` parses but examples instantiate entities and derive walkability by hand. | rpg, tilemap | **Split**: parse **PRESENT** (`modules/tmx`); auto-spawn/collision-layer **ABSENT** (no `modules/tilemap`). | **Trigger met (2 authored-tile-grid consumers).** → backlog `modules/tilemap` (auto-spawn + collision-layer). (audit B15) |
| Steering / seek AI — constant-speed seek; no separation/pathfinding. | top-down-shooter, card-battler (intent) | **ABSENT** (seek): no `modules/ai`. NB `modules/pathfinding` exists but is route-finding (A*), not constant-speed steering. | **Defer** → backlog `modules/ai` (speculative; record 2, rule-of-three contested). (audit B17) |
| Sprite animation state machine — idle→walk→attack frame cycling. | rpg | **ABSENT**: no `modules/animation`. | **Defer** → backlog `modules/animation` (deferred; ship needs ≥2). (audit B18) |
| Rhythm timing stack — audio-clock `TickSource`, hit-window judgement, lookahead/absolute-time spawn, timestamped input queue, latency comp. | rhythm | **ABSENT**: no `modules/rhythm`. | **Defer** → backlog NEW speculative `modules/rhythm`. Genre-specific but real & cleanly built. (audit B21) |
| App-host mount/unmount contract — `start(container) => Teardown`, lazy-load race guard, mount→cleanup→async-load→teardown orchestration. | hub (every example re-implements `start`/teardown) | **ABSENT**: no app-host helper module. | **Defer** → backlog NEW speculative app-host helper. Low priority. (audit hub note) |

### Resolved — capability ships and consumers adopted it

| Gap (symptom) | Consumers | Verified @ src (2026-07-15) | Notes |
|---|---|---|---|
| World-level `reset()` / `clear()`. Consumers hand-drain every store (and the spatial grid) via `[...store.keys()].forEach(queueDestroy)`. | asteroids, platformer, snake | **PRESENT + adopted**: `clearAll()`@[`world.ts:103`](../../src/world.ts) (the API is `clearAll()`, **not** `reset()`); every example already calls it. The `queueDestroy` loops that remain are legitimate per-entity culling, which `clearAll`'s own docs direct callers to do separately. | **Phantom corrected 2026-07-15** — prior rows claimed "ships as `world.reset()`, adoption pending". Wrong name + already adopted → nothing to migrate. |
| Component serialize/deserialize boilerplate for components that are never persisted — dead pass-through code required by the store API. | asteroids, snake | **PRESENT**: `simpleComponent`@[`component-store.ts:335`](../../src/component-store.ts) (`registryComponent`@:380). Both consumers already use it ([rock-tier.ts](../../examples/asteroids/src/components/rock-tier.ts), [direction.ts](../../examples/snake/src/components/direction.ts)). | Stale gap — capability shipped + adopted. |
| Circle-vs-AABB collision helper. Consumers hand-write `circleVsRect`. | flappy, breakout | **PRESENT**: `aabbVsCircle`@[`collision/narrowphase.ts:41`](../../src/modules/collision/narrowphase.ts). | **Test resolved** (the push-out *response* lives in the bounce row above). flappy migrated to `aabbVsCircle` (`b5a253e`); breakout still hand-rolls because it fuses the *test* with a push-out *response* — that response is the separate Promoted bounce row. See [audit](../archived/example-engine-gap-audit.md) A1. |
| AABB-vs-AABB overlap test. Consumers hand-write the rect-vs-rect overlap predicate. | jetpack, space-invaders, frogger, local-pong | **PRESENT**: `aabbVsAabb`@[`collision/narrowphase.ts:25`](../../src/modules/collision/narrowphase.ts) (+ `aabbVsAabbSwept`@:88, `circleVsCircle`@:33). All 4 consumers migrated (`b5a253e`). | space-invaders runs it across rockets×aliens/bombs/bunkers/mothership; frogger for the frog vs same-row cars. See [audit](../archived/example-engine-gap-audit.md) A1. |
| Timed-lifetime (TTL) entities. Consumers hand-roll an `ageMs`/`lifeMs` component + reaper. | jetpack, space-invaders, frogger, top-down-shooter | **PRESENT**: `LifetimeDef`@[`lifetime/lifetime.ts:7`](../../src/modules/lifetime/lifetime.ts) + `makeLifetimeSystem`@:27. jetpack/space-invaders/frogger migrated (`b5a253e`); top-down-shooter already used it. | Recurs anywhere there are particles/projectiles. See [audit](../archived/example-engine-gap-audit.md) A2. |
| DOM renderer. No engine DOM-renderer, so consumers write entity↔DOM mapping + orphan cleanup + zone tag management by hand. | card-battler | **PRESENT**: `modules/render-dom/` exists in the module tree (V1, 2026-04-23). | Covers entity↔DOM mapping + orphan cleanup + zone tags. |
| Fisher–Yates shuffle + random-pick. Pure, domain-neutral utility. | card-battler, solitaire, snake | **PRESENT + adopted**: `modules/rng` ships `shuffle`/`pick`/`randomInt`/`makeSeededRng`@[`rng/rng.ts`](../../src/modules/rng/rng.ts). All 3 migrated: card-battler@[`game.ts`](../../examples/card-battler/src/game.ts) (`shuffle`+`pick`), solitaire@[`game.ts`](../../examples/solitaire/src/game.ts) (`shuffle`) + [`main.ts`](../../examples/solitaire/src/main.ts) (`pick`), snake@[`game.ts`](../../examples/snake/src/game.ts) (`pick`). | **Shipped 2026-07-15** (Local→Engine migration #2). The seedable `makeSeededRng` (mulberry32) enables deterministic tests/replays. (audit B6) |
| Velocity normalize / set-speed-in-direction — `hypot` rescale to a target magnitude. | breakout, top-down-shooter | **PRESENT + adopted**: `modules/motion` ships `normalize` + `scaleToSpeed`@[`motion/vec.ts`](../../src/modules/motion/vec.ts). Migrated: breakout `setBallSpeed`@[`systems.ts:27`](../../examples/breakout/src/systems.ts), top-down-shooter player-move@[`input.ts:44`](../../examples/top-down-shooter/src/systems/input.ts) + enemy-steer@[`enemy-steer.ts:33`](../../examples/top-down-shooter/src/systems/enemy-steer.ts) (keeps its `<1e-3` close-guard, then `scaleToSpeed`). | **Shipped 2026-07-15** (Local→Engine migration #5). Zero-length input → `{0,0}` (no `NaN`). (audit B13) |

### Rejected — declined (not engine surface)

| Gap (symptom) | Consumers | Verified @ src (2026-07-15) | Notes |
|---|---|---|---|
| Scoring / lives / game-over scaffold. | nearly all | **n/a** — declined as content, not engine (per-game). | → backlog Non-goals (declined). (audit B14) |

## Resolved — canon promoted during the build

Standard capabilities that were clearly canon, so the engine was extended
(new primitive or existing module) under the sliding-scale rule when the
example hit them. Recorded for history; no triage needed.

| Surface | What was missing → fix | Example | Resolution |
|---|---|---|---|
| `modules/tmx` | Parser only handled base64+zlib layers, inline tilesets, no flip flags → added CSV layer encoding, external `.tsx` tileset sources, and per-tile flip-flag unpacking. All standard TMX. | rpg | Resolved (`bb4072b`). |
| `modules/input` | Digital action-only, no pointer → shipped `PointerProvider` for continuous mouse position + button-hold state. | top-down-shooter | Resolved. |
| `PointerProvider` | Lacked viewport-relative coordinates → added `clientX` / `clientY` fields for target-local hit-testing. | card-battler | Resolved. |

## Related

- [extending-the-engine.md](../extending-the-engine.md) — the promotion
  rule-book (sliding-scale evidence rule; promote-vs-keep-local).
- [ecs-module-backlog.md](ecs-module-backlog.md) — where triaged gaps
  become module entries.
