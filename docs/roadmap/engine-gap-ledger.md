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

## Open gaps (awaiting triage)

The **Consumers** column is the live tally that feeds the promotion rule.

| Gap (symptom) | Consumers | Status | Notes |
|---|---|---|---|
| Continuous coordinates → grid-cell projection. `HashGrid2D` keys on integer cells, so consumers hand-roll `cellOf(x,y)` + grid-sync (`onMove`/`indexStatic`) boilerplate. | asteroids, platformer, top-down-shooter | Promoted | **Trigger met (3rd+ consumer).** → backlog `ContinuousHashGrid2D(cellSize)`. |
| World-level `reset()` / `clear()`. Consumers hand-drain every store (and the spatial grid) via `[...store.keys()].forEach(queueDestroy)`. | asteroids, platformer, snake | Open | **Ships as `world.reset()`** ([`src/world.ts`](../../src/world.ts)) — adoption follow-up (migrate hand-rolled teardowns), not a new module. |
| Component serialize/deserialize boilerplate for components that are never persisted — dead pass-through code required by the store API. | asteroids, snake | Resolved | **Stale** — `simpleComponent` ships; both consumers already use it ([rock-tier.ts](../../examples/asteroids/src/components/rock-tier.ts), [direction.ts](../../examples/snake/src/components/direction.ts)). |
| Sprite renderer ignores GID flip/rotation bits. Consumers unpack flip bits from the GID but `gidToFrame` doesn't apply them, so flipped tiles render unflipped. | tilemap, rpg | Promoted | rpg added flip-flag *unpacking* to `modules/tmx`; the renderer still doesn't honour them. → backlog render-canvas2d V3 (honour flip flags). |
| Entity-lifecycle / tag-change events. No reactive hook, so consumers walk every entity every frame to detect tag (zone) changes. | card-battler | Open | **Hold** — 1 consumer, speculative; no backlog entry yet. |
| Circle-vs-AABB collision helper. ~~Engine ships `circleVsCircle` only~~ — **stale: `aabbVsCircle` ships in `modules/collision`**; consumers hand-write `circleVsRect` anyway. | flappy, breakout | Resolved | **Test resolved** (the push-out *response* lives in the bounce row below). Primitive exists ([`collision/narrowphase.ts`](../../src/modules/collision/narrowphase.ts)). flappy migrated to `aabbVsCircle` (`b5a253e`); breakout still hand-rolls because it fuses the *test* with a push-out *response* (expanded-AABB / Minkowski form) — that response is the separate open bounce row below, not the test helper. See [example-engine-gap-audit.md](../archived/example-engine-gap-audit.md) A1. |
| Collision bounce/reflection response. Engine has no helper to resolve a circle-vs-AABB overlap into a corrected position + reflected velocity, so consumers hand-roll axis-of-least-penetration reflection. | breakout, local-pong, frogger (partial) | Promoted | → backlog `modules/collision` V2 (reflection). `modules/kinematics` already does push-out+velocity-zero; reflection ≠ zero. Distinct from the *test* above: this is the *response* (push-out + velocity flip on the smaller-penetration axis). breakout fuses test+response; local-pong reflects the ball off paddles/walls; frogger partial. (audit B5) |
| AABB-vs-AABB overlap test. ~~Engine ships `circleVsCircle` only~~ — **stale: `aabbVsAabb` ships in `modules/collision`**; consumers hand-write the rect-vs-rect overlap predicate anyway. | jetpack, space-invaders, frogger, local-pong | Resolved | Primitive exists ([`collision/narrowphase.ts`](../../src/modules/collision/narrowphase.ts) — `aabbVsAabb`, `aabbVsCircle`, `aabbVsAabbSwept`); all 4 consumers migrated (`b5a253e`). space-invaders runs it across rockets×aliens/bombs/bunkers/mothership; frogger for the frog vs same-row cars. See [example-engine-gap-audit.md](../archived/example-engine-gap-audit.md) A1. |
| Timed-lifetime (TTL) entities. ~~No engine "live for N ms then despawn" component~~ — **stale: `LifetimeDef` + `makeLifetimeSystem` ship in `modules/lifetime`**; consumers hand-roll an `ageMs`/`lifeMs` component + reaper anyway. | jetpack, space-invaders, frogger, top-down-shooter | Resolved | Primitive exists ([`lifetime/lifetime.ts`](../../src/modules/lifetime/lifetime.ts)); jetpack/space-invaders/frogger migrated (`b5a253e`), top-down-shooter already used it. Recurs anywhere there are particles/projectiles. See [example-engine-gap-audit.md](../archived/example-engine-gap-audit.md) A2. |
| Carried / attached moving-platform rider kinematics. No engine parenting/attachment, so a rider that should inherit a moving platform's velocity per tick (frog on a log/turtle) hand-adds the platform's `vx * dt` to its own position each frame. | frogger | Promoted | → backlog NEW `modules/attach` (follow/carrier). With the B12 follower row = 3 consumers → un-declines the hierarchy item in lighter form. A general "attach entity to carrier, inherit carrier delta each tick" primitive would also serve one-way platforms and conveyor belts. |
| Composite / multi-drawable renderable. `Renderable` is one drawable per entity, so multi-part sprites (pipe pairs) are hand-drawn instead of using the renderer. | flappy | Open | **Hold** — 1 consumer; `RenderableDef` V3 composite, no entry yet. |
| 3D transform components. `PositionDef` / `VelocityDef` / `GroundedDef` are 2D-only; 3D consumers redefine them locally. | platformer-3d | Promoted | **Defer** → backlog "3D siblings (speculative)". |
| 3D spatial structure (`HashGrid3D`). No 3D broadphase, so consumers brute-force collision checks. | platformer-3d | Promoted | **Defer** → backlog "3D siblings (speculative)". |
| DOM renderer. No engine DOM-renderer, so consumers write entity↔DOM mapping + orphan cleanup + zone tag management by hand. | card-battler | Resolved | `modules/render-dom` V1 (2026-04-23) — the driving consumer; covers entity↔DOM mapping + orphan cleanup + zone tags. |
| Renderer doesn't consume a camera/view transform. `Canvas2DRenderer` draws entities in raw world coords, so a scrolling/zooming world hand-writes `ctx2d.translate(...)` even when a `CameraDef` already exists. rpg runs `makeFollowCameraSystem` then *still* manually translates by the camera offset — the camera computes the view, the renderer ignores it. | rpg, tilemap | Promoted | → backlog `camera` V2 + render-canvas2d camera-consume. The Unity/Godot model: world rendering always goes through the camera transform. Pairs with the `camera` module's missing free-pan/zoom variant (tilemap). See [example-engine-gap-audit.md](../archived/example-engine-gap-audit.md) A5. |
| Renderer can't express non-entity decorations, text, or screen-space overlays. `Renderable` only covers Position+Renderable entities, so static chrome (court net, dashed center line, borders), score/HUD text, and full-screen overlays (game-over panels) are hand-drawn with raw `ctx2d`. No text renderable, no shape (line/circle) renderable, no camera-independent overlay pass. | local-pong, snake | Promoted | **Text/shape renderables already ship** (`RenderableDef` text/rect/circle/polygon) — that half is adoption follow-up. Genuine gap = camera-independent **overlay pass** → backlog `RenderableDef` V3 overlay. The Unity/Godot model: a separate screen-space UI/overlay layer for HUD + chrome. See [example-engine-gap-audit.md](../archived/example-engine-gap-audit.md) A7. |

### From the all-examples audit sweep

Gaps surfaced by the one-time cross-sectional [audit](../archived/example-engine-gap-audit.md)
(archived) that the incrementally-grown rows above hadn't captured. Consumer
counts are the cross-example tally the audit measured; they feed the promotion
rule directly.

| Gap (symptom) | Consumers | Status | Notes |
|---|---|---|---|
| Off-screen / boundary recycling & culling — despawn-or-wrap entities that leave a region; cull off-screen entities from update/render. | flappy, jetpack, asteroids, frogger (wrap), top-down-shooter, tilemap (cull) | Promoted (split) | **wrap + clamp already ship** in `modules/motion` `boundary:{mode}` (adoption follow-up); **despawn** is trivial (`modules/lifetime` + `queueDestroy`). Genuine gap = **cull off-screen from render** → backlog `camera` V2 view-rect + render-canvas2d viewport cull. (audit B1) |
| Spawn timer / cadence with difficulty ramp — "emit an entity every T ms, where T lerps with difficulty." | flappy, jetpack, space-invaders, top-down-shooter | Promoted | → backlog NEW `modules/spawner` (cadence + ramp). (audit B2) |
| Cooldown / debounce / grace timer — a `CooldownDef` + auto-decrement system covering fire-rate AND invulnerability i-frames. | asteroids (fire), top-down-shooter (fire), jetpack (bullet), space-invaders (invuln) | Promoted | → backlog NEW `modules/cooldown`. (audit B3) |
| Boundary clamp — constrain an entity to a region (clamp position to bounds + zero velocity on breach). | flappy, jetpack, breakout, rpg | Open | **Ships as `modules/motion` `boundary:{mode:'clamp'}`** — adoption follow-up, not a new module. (audit B4) |
| Fisher–Yates shuffle + random-pick-from-tag. Pure, domain-neutral utility. | card-battler, solitaire, snake (`randomEmptyCell`) | Promoted | → backlog NEW `modules/rng` (shuffle + pick + optional seed). (audit B6) |
| Discrete grid/tile movement & snapping — step-on-tick, snap-to-cell, occupancy query, 180°-reversal guard. | snake, frogger, rpg | Promoted | → backlog NEW `modules/grid-movement`. `grid-based` is FOV/LOS only, not movement. (audit B7) |
| Particle system / radial burst — each consumer hand-rolls `spawnParticle` + radial `burst()`. | frogger, jetpack, space-invaders, asteroids | Promoted | **Trigger met (4 consumers).** → backlog `modules/particles` (emitter/burst). TTL already ships (`modules/lifetime`). (audit B8) |
| Pointer → canvas DPI coordinate transform — DPI-aware client→world mapping. | breakout, solitaire, tilemap | Open | **Ships as `PointerProvider.defaultProject`** (DPI/client→canvas) — adoption follow-up. (audit B9) |
| Zone/pile tag-move management — hand↔deck↔discard / stock↔waste tag swaps. | card-battler, solitaire | Open | **Hold** — 2 consumers, genre-clustered (card-interaction); no entry yet. (audit B10) |
| Drag-and-drop hit-testing (DOM + canvas) — reverse hit-test + legal-drop predicate. | card-battler, solitaire | Open | **Hold** — 2 consumers, genre-clustered (card-interaction); no entry yet. (audit B11) |
| Child/parent follower transform sync — "entity B tracks entity A's pos/rot each frame." | asteroids (thrust flame), space-invaders | Promoted | → backlog NEW `modules/attach` (with the frogger rider row = 3 consumers). pos/rot follow vs velocity inheritance — same module. (audit B12) |
| Velocity normalize / set-speed-in-direction — `hypot` rescale to a target magnitude. | breakout, top-down-shooter | Promoted | → backlog extend `modules/motion` (vector normalize / set-speed util). (audit B13) |
| Scoring / lives / game-over scaffold. | nearly all | Rejected | Content, not engine — scoring/lives/game-over is per-game. → backlog Non-goals (declined). (audit B14) |
| Tilemap → entity auto-spawn + collision-layer derivation. `tmx` parses but examples instantiate entities and derive walkability by hand. | rpg, tilemap | Promoted | **Trigger met (2 authored-tile-grid consumers).** → backlog `modules/tilemap` (auto-spawn + collision-layer). (audit B15) |
| Steering / seek AI — constant-speed seek; no separation/pathfinding. | top-down-shooter, card-battler (intent) | Promoted | **Defer** → backlog `modules/ai` (speculative; record 2, rule-of-three contested). (audit B17) |
| Sprite animation state machine — idle→walk→attack frame cycling. | rpg | Promoted | **Defer** → backlog `modules/animation` (deferred; ship needs ≥2). (audit B18) |
| Two-player local input mapping — per-player `InputState` + key routing. | local-pong | Open | **Two `createInput`s already work** (adoption); slot abstraction → backlog local-multiplayer player-slot (speculative). (audit B19) |
| Rhythm timing stack — audio-clock `TickSource`, hit-window judgement, lookahead/absolute-time spawn, timestamped input queue, latency comp. | rhythm | Promoted | **Defer** → backlog NEW speculative `modules/rhythm`. Genre-specific but real & cleanly built. (audit B21) |
| App-host mount/unmount contract — `start(container) => Teardown`, lazy-load race guard (stale-load token/CAS), mount→cleanup→async-load→teardown orchestration. | hub (every example re-implements `start`/teardown) | Promoted | **Defer** → backlog NEW speculative app-host helper. Low priority. (audit hub note) |

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
