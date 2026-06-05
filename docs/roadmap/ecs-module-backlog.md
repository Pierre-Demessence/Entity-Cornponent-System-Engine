# ECS Module Backlog

Companion to
[core-engine-roadmap.md](core-engine-roadmap.md) and
[prototype-games-roadmap.md](prototype-games-roadmap.md). Captures modules
surfaced by
[../plans/done/ecs-2d-engine-modules.md](../plans/done/ecs-2d-engine-modules.md)
that did not ship, plus the standard module set any mature engine
eventually grows. Nothing here is scheduled; each entry is either
explicitly deferred, explicitly speculative, or explicitly "we have
considered and rejected".

## Table of contents

- [ECS Module Backlog](#ecs-module-backlog)
  - [Table of contents](#table-of-contents)
  - [Conventions](#conventions)
    - [Status vocabulary](#status-vocabulary)
    - [Shape vs Scope](#shape-vs-scope)
    - [Version suffixes (V1 / V2 / …)](#version-suffixes-v1--v2--)
    - [Engine extension rule-book](#engine-extension-rule-book)
  - [Deferred 2D modules](#deferred-2d-modules)
    - [`modules/camera` V1 — ✅ shipped 2026-04-21](#modulescamera-v1---shipped-2026-04-21)
    - [`modules/camera` V2 — deferred](#modulescamera-v2--deferred)
    - [`RenderableDef` extensions V2 — ✅ shipped 2026-04-22](#renderabledef-extensions-v2---shipped-2026-04-22)
    - [`RenderableDef` extensions V3 — deferred](#renderabledef-extensions-v3--deferred)
    - [`ContinuousHashGrid2D(cellSize)` — deferred](#continuoushashgrid2dcellsize--deferred)
    - [`modules/input` event-mode variant — deferred](#modulesinput-event-mode-variant--deferred)
    - [`modules/input` — pure `projectPointer` export — deferred](#modulesinput--pure-projectpointer-export--deferred)
  - [3D siblings — speculative](#3d-siblings--speculative)
  - [Rigid-body physics — speculative](#rigid-body-physics--speculative)
  - [Standard engine modules](#standard-engine-modules)
    - [`modules/audio` V1 — ✅ shipped 2026-04-23](#modulesaudio-v1---shipped-2026-04-23)
    - [`modules/audio` V2 — deferred](#modulesaudio-v2--deferred)
    - [`modules/animation` — deferred](#modulesanimation--deferred)
    - [`modules/particles` — deferred](#modulesparticles--deferred)
    - [`modules/ui` — speculative](#modulesui--speculative)
    - [`modules/render-dom` V1 — ✅ shipped 2026-04-23](#modulesrender-dom-v1---shipped-2026-04-23)
    - [`modules/render-dom` V2 — deferred](#modulesrender-dom-v2--deferred)
    - [`modules/scene-transition` V1 — ✅ shipped 2026-04-23](#modulesscene-transition-v1---shipped-2026-04-23)
    - [`modules/scene` V2 — deferred](#modulesscene-v2--deferred)
    - [`modules/save` V1 — ✅ shipped 2026-04-23](#modulessave-v1---shipped-2026-04-23)
    - [`modules/save` V2 — deferred](#modulessave-v2--deferred)
    - [`modules/asset-loader` V1 — ✅ shipped 2026-04-24](#modulesasset-loader-v1---shipped-2026-04-24)
    - [`modules/asset-loader` V2 — deferred](#modulesasset-loader-v2--deferred)
    - [`modules/tmx` V1 — ✅ shipped 2026-04-24](#modulestmx-v1---shipped-2026-04-24)
    - [`modules/tilemap` — deferred](#modulestilemap--deferred)
    - [`modules/pathfinding` V1 — ✅ shipped 2026-04-22](#modulespathfinding-v1---shipped-2026-04-22)
    - [`modules/pathfinding` V2 — deferred](#modulespathfinding-v2--deferred)
    - [`modules/grid-based` V1 — ✅ shipped 2026-04-23](#modulesgrid-based-v1---shipped-2026-04-23)
    - [`modules/grid-based` V2 — deferred](#modulesgrid-based-v2--deferred)
    - [`modules/debug` — deferred](#modulesdebug--deferred)
    - [`modules/ai` — speculative](#modulesai--speculative)
    - [`modules/networking` — speculative](#modulesnetworking--speculative)
    - [Local-multiplayer player-slot / input-owner helper — speculative](#local-multiplayer-player-slot--input-owner-helper--speculative)
  - [Gameplay \& utility modules — from the examples audit (2026-07-15)](#gameplay--utility-modules--from-the-examples-audit-2026-07-15)
    - [`modules/collision` V2 — reflection response — deferred](#modulescollision-v2--reflection-response--deferred)
    - [`modules/motion` — vector util (normalize / set-speed) — ✅ shipped 2026-07-15](#modulesmotion--vector-util-normalize--set-speed---shipped-2026-07-15)
    - [`modules/motion` — boundary inset / per-entity size — deferred](#modulesmotion--boundary-inset--per-entity-size--deferred)
    - [`modules/timer` — ✅ shipped 2026-07-16](#modulestimer---shipped-2026-07-16)
    - [`modules/spawner` — deferred](#modulesspawner--deferred)
    - [`modules/cooldown` — ✅ shipped 2026-07-16](#modulescooldown---shipped-2026-07-16)
    - [`modules/grid-movement` — deferred](#modulesgrid-movement--deferred)
    - [`modules/rng` — ✅ shipped 2026-07-15](#modulesrng---shipped-2026-07-15)
    - [`modules/attach` — deferred](#modulesattach--deferred)
    - [`modules/rhythm` — speculative](#modulesrhythm--speculative)
    - [App-host mount / teardown helper — speculative](#app-host-mount--teardown-helper--speculative)
  - [Non-goals (declined)](#non-goals-declined)
  - [Promotion triggers — summary](#promotion-triggers--summary)

## Conventions

### Status vocabulary

- **✅ Shipped** — module is live in `@pierre/ecs` or an app, with at
  least one real consumer.
- **Deferred** — planned shape is clear; waiting on a concrete trigger
  (consumer, pain, or prototype).
- **Speculative** — shape is sketched but would only exist if a specific
  class of game is attempted.
- **Declined** — we have considered and rejected; rationale recorded to
  prevent re-litigating.

### Shape vs Scope

Each entry opens with a one-liner labelled either **Shape** or **Scope**:

- **Shape** — used only for ✅-shipped entries where the API is pinned.
  One line with concrete types / function signatures.
- **Scope** — used for everything else (deferred, speculative,
  declined). One or two lines describing what the module would cover.
  When a sketched API exists it shows up inside the details as
  "Probable shape".

### Version suffixes (V1 / V2 / …)

When a module ships but parts of its originally-imagined scope are
deliberately left out, the shipped slice becomes **V1** and a sibling
**V2** entry captures what was deferred. Each further round of deferral
increments: V3, V4, etc. Keeps the "this is done" and "there's more to
do" signals separate without rewriting history.

### Engine extension rule-book

Every entry follows the same sliding-scale rule: a module ships once its
*shape* is proven, where internal consumers and external canon are
interchangeable evidence — unanimous universal canon needs **0**
consumers, solid canon **1**, and a novel/opinionated shape **2** (the
genuine rule of three). Nothing ships speculatively. See
[https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/extending-the-engine.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/extending-the-engine.md)
for the full rule-book and guardrails.

---

## Deferred 2D modules

### `modules/camera` V1 — ✅ shipped 2026-04-21

See
[src/modules/camera/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/camera/README.md)
and plan
[../plans/done/ecs-camera-module.md](../plans/done/ecs-camera-module.md).

### `modules/camera` V2 — deferred

**Scope.** Features deliberately left out of V1: zoom, rotation,
deadzone, clamping, parallax, pixel/tile helpers, an exposed **view
rect** (for off-screen culling), and **renderer camera-consumption**
(world rendering goes through the camera transform instead of the
renderer ignoring `CameraDef`).

<details>
<summary>Details</summary>

**Trigger.** Second consumer that needs any of these. Today only the
roguelike uses the camera and it has none of these requirements. The
snake ↔ `modules/render-canvas2d` migration is also blocked on V2
(needs zoom to push the `cells → pixels` scale onto the camera
instead of baking it into every renderable).

**Rationale for deferral.** Each feature pays a real cost — zoom
invalidates viewport-space assumptions in the renderer, clamping
demands a world-bounds concept that doesn't exist in the core, parallax
adds a layer model, rotation adds a matrix-math hot path. A real
consumer (plus the canon that already pins each shape) is how each
lands.

**Renderer camera-consume + cull — MET (2026-07-15).** Two consumers
(rpg, tilemap) run a follow-camera then *still* manually
`ctx2d.translate(...)` because `Canvas2DRenderer` ignores `CameraDef`
(engine-gap-ledger). The same exposed view-rect feeds off-screen render
culling (tilemap, audit B1). Both land with V2.

</details>

### `RenderableDef` extensions V2 — ✅ shipped 2026-04-22

See
[src/modules/render-canvas2d/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/render-canvas2d/README.md)
and plan
[../plans/done/render-canvas2d-v2.md](../plans/done/render-canvas2d-v2.md).

### `RenderableDef` extensions V3 — deferred

**Scope.** Extensions to the `RenderableDef` union and
`Canvas2DRenderer` not covered by V2: sprite/texture variant,
tilemap variant, Canvas filters, a camera-independent **screen-space
overlay pass** (HUD / chrome / game-over panels), and **honouring GID
flip/rotation bits** in the sprite path.

<details>
<summary>Details</summary>

**Sprite / texture variant.** Canon is unanimous on the shape (Pixi
`Sprite`, Phaser `Image` / `Sprite`, Unity `SpriteRenderer`, Bevy
`SpriteBundle`), so it can ship on canon alone. Blocked on
`modules/asset-loader` — shipping a sprite primitive before there's a way
to load image assets is premature.

**Tilemap variant.** Novel enough to want a real consumer first — none
yet; snake's cell-based rendering currently goes through `rect`.

**Canvas filters (`ctx.filter`).** Wait for a consumer. Blur, drop-shadow
and similar post-processing effects are rarely used in practice;
wait for a concrete request.

**Snake ↔ `modules/render-canvas2d` migration.** Separately tracked
under `modules/camera` V2 — blocked on V2 zoom so `Canvas2DRenderer`
can apply the `cells → pixels` transform instead of every
renderable multiplying by `CELL` by hand.

**Screen-space overlay pass — MET (2026-07-15).** Text and shape
renderables (`text`/`rect`/`circle`/`polygon`) already ship in V2 —
local-pong and snake just hand-draw instead (adoption follow-up). The
genuine gap is a camera-independent overlay layer for HUD/score/chrome
and full-screen panels (engine-gap-ledger; audit A7). Two consumers
(local-pong, snake).

**GID flip bits — MET (2026-07-15).** `modules/tmx` already unpacks
flip/rotation flags via `splitGidFlags`, but the sprite renderer draws
tiles unflipped (tilemap, rpg — engine-gap-ledger). Honour them in the
sprite-frame draw path.

</details>

### `ContinuousHashGrid2D(cellSize)` — deferred

**Scope.** Convenience wrapper around `HashGrid2D` + `cellOfPoint` /
`cellsForAabb` / `cellsForCircle` so callers don't project continuous
positions to cells by hand.

<details>
<summary>Details</summary>

**Trigger — MET (2026-07-15).** Third consumer landed: asteroids,
platformer, and top-down-shooter all hand-roll the continuous→cell
projection (engine-gap-ledger). Ready to build; not yet scheduled.

**Rationale.** Deferred despite the canon: the composition-in-app pattern
is explicit and debuggable, the wrapper would only hide one function call.

</details>

### `modules/input` event-mode variant — deferred

**Scope.** Event-driven action dispatch for turn-based games (single
keypress = single turn), complementary to the shipped poll-on-tick
`createInput`.

<details>
<summary>Details</summary>

**Probable shape.** An `EventInput<TAction>` that wraps
`InputProvider`, applies the same `InputMap`, and dispatches to a
subscriber callback on the keydown edge.

**Trigger.** A second turn-based consumer of `@pierre/ecs` appears,
OR a deliberate decision to design event-mode proactively to unblock
the roguelike migration.

**Rationale.** The shipped `createInput` (M5) is calibrated for
real-time games (snake / asteroids / platformer): poll-based,
flat-action enum, `KeyboardEvent.code` (layout-independent, no
modifier awareness). The roguelike's input is event-driven (keydown
emits the turn-action immediately), action-with-payload (move dx/dy),
and uses `KeyboardEvent.key` (so `>` for descend works as Shift+Period
on a US layout without explicit modifier tracking). Forcing the
roguelike onto the current `createInput` either produces glue code
that fights the engine model (split move into 4 directional actions,
manually combine `ShiftLeft`+`Period` for `>`, run a tick loop just
to poll), or settles for using `KeyboardProvider` only and bringing
the entire mapping layer back in-app — which saves ~5 lines and is
not a real win.

The honest split is: `createInput` for real-time, `EventInput` for
turn-based. Promote per the engine's ≥2-real-consumer rule. Until
then, the roguelike keeps its existing `src/ui/input.ts` mapping
layer and DOM listeners — those are the right shape for that game.

</details>

---

### `modules/input` — pure `projectPointer` export — deferred

**Scope.** Export the DPI-aware client→canvas projection as a pure
`projectPointer(ev, target) => { x, y }` so event-time pointer handlers
can reuse it without instantiating the stateful `PointerProvider`.

<details>
<summary>Details</summary>

**Trigger — MET (2 consumers, dual-cited 2026-07-15).** The projection
logic ships, but only as the **module-private** `defaultProject`@
`src/modules/input/pointer-provider.ts:140`; the public surface is
`PointerProvider`, a stateful, tick-read `InputProvider` that owns its
listeners and exposes `state.x/y`. breakout
(`examples/breakout/src/main.ts:103`) and solitaire
(`examples/solitaire/src/main.ts:146`) project at **event-time** inside
click/move handlers and replicate `defaultProject`'s
`(clientX/Y − rect) × (canvas.width / rect.width)` math verbatim — they
cannot adopt the provider without a timing/architecture change
(engine-gap-ledger B9). This is a **Build** (export a pure fn), not a
mechanical adoption.

**Probable shape.** Lift `defaultProject` to an exported
`projectPointer(ev: { clientX: number; clientY: number }, target:
HTMLCanvasElement) => { x: number; y: number }` and have
`PointerProvider` call it internally. No new component; the provider's
surface is unchanged.

**Non-fits (verified).** tilemap (`examples/tilemap/src/main.ts:119`)
layers zoom/pan on top → custom viewport project; space-invaders
(`examples/space-invaders/src/main.ts:115`) does no DPI scaling (a
half-screen decision). Neither would consume the helper.

**Canon.** Every canvas game with mouse/touch input needs the same
client→backing-store transform; exposing it as a pure fn is the minimal
shared surface (vs. forcing the stateful provider on event-driven UIs).

</details>

---

## 3D siblings — speculative

**Scope.** Parallel 3D-dimension modules (transform, motion, collision,
kinematics, render-webgl/webgpu, camera-3d) that ship alongside the 2D
stack rather than replacing it.

<details>
<summary>Details</summary>

Forward-looking per the 2D-vs-3D strategy in the shipped plan: when 3D
lands, dimension-sensitive modules ship as **parallel siblings**, not
extensions or renames (Godot / flecs model). All entries below exist
only if a 3D prototype is attempted, and none is scheduled.

| Module | Shape | Canon |
|---|---|---|
| `modules/transform-3d` | `Position3DDef {x,y,z}`, quaternion `Rotation3DDef`, `ScaleDef` | Bevy `Transform`, Unity, Godot `Node3D` |
| `modules/motion-3d` | 3-vector velocity integrator + optional 3D bounds | Bevy integrators |
| `modules/collision-3d` | `ShapeAabb3Def`, `ShapeSphereDef`, optional `ShapeObbDef`; AABB3 / sphere / OBB narrowphase | Bevy `bevy_rapier3d`, PhysX primitives |
| `modules/kinematics-3d` | Arcade 3D character controller — gravity + axis-separated resolution against statics | Unity `CharacterController`, Godot `CharacterBody3D` |
| `modules/render-webgl` | `Renderer<TCtx>` implementation backed by WebGL | three.js, Babylon |
| `modules/render-webgpu` | Same interface, WebGPU backend | Bevy WGPU, three.js WebGPU renderer |
| `modules/camera-3d` | Perspective + orthographic projection, frustum, view matrix | Bevy `Camera3dBundle`, Unity `Camera` |

**Trigger for the whole group.** A scoped 3D prototype (matches
[prototype-games-roadmap.md](prototype-games-roadmap.md)'s ladder — 3D
platformer or similar). Until then, the 2D stack is the only stack.

**Rules (re-affirmed from the shipped plan).**

- Do not add `z` to `PositionDef`. Breaks `HashGrid2D`, every query, and
  the 2D contract.
- Do not preemptively rename `PositionDef` → `Position2DDef`. Retroactive
  rename only if mixed 2D/3D games prove it ambiguous.
- `SpatialStructure<TPos>` already generic in core — a future
  `HashGrid3D` ships as another backend with zero core change. That's
  why spatial is dimension-agnostic and isn't duplicated above.

</details>

---

## Rigid-body physics — speculative

**Scope.** Full rigid-body simulation (mass, restitution, constraints,
continuous collision across many dynamic bodies) distinct from the
shipped arcade `modules/kinematics`.

<details>
<summary>Details</summary>

**Probable shape.** Either roll our own (AABB-only, minimal) or adapt
`planck.js` / `rapier-js`. Integrates with `SpatialStructure` via a
physics-appropriate backend (BVH / SweepAndPrune). Distinct from the
shipped arcade `modules/kinematics`, which covers platformers,
top-down action, and twin-stick shooters.

**Trigger.** A prototype that arcade physics genuinely cannot handle —
typical examples: stacking crates with realistic settle, rope / chain,
jointed ragdoll, soft-body, vehicles with suspension.

**Rationale for deferral.** Arcade covers platformers, top-down action,
twin-stick shooters, and puzzle-physics-lite. Full physics is a large
ongoing commitment (authoring tools, debug viz, determinism tuning) and
should not be spent without a game design that demands it.

</details>

---

## Standard engine modules

Every mature engine eventually ships these. Listed with scope sketches
so "what would this even look like" is not a greenfield question when
the time comes.

### `modules/audio` V1 — ✅ shipped 2026-04-23

See
[src/modules/audio/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/audio/README.md)
and plan
[../plans/done/audio-module.md](../plans/done/audio-module.md).

### `modules/audio` V2 — deferred

**Scope.** Audio features deliberately excluded from V1: spatial
listener modeling, event adapters for bus-driven one-shots, and clip
loading orchestration with `modules/asset-loader`.

<details>
<summary>Details</summary>

**Status.** V1 now ships reusable primitives in
`@pierre/ecs/modules/audio`: `AudioSourceDef`, `AudioQueue`,
`makeAudioSystem`, and `WebAudioProvider` with channel volume control.

**Trigger.** A second consumer needs listener-aware playback or shared
event wiring conventions, OR asset loading lands and two apps need the
same clip-binding flow.

**Canon.** Unity `AudioSource` / `AudioListener`, Godot `AudioStream*`,
Phaser `SoundManager`, Bevy `bevy_audio`.

</details>

### `modules/animation` — deferred

**Scope.** Sprite-frame animation, tweens, and (much later) skeletal /
2D rig animation — probably as three separate sub-modules.

<details>
<summary>Details</summary>

**Probable shape.**

- **Sprite animation** — `SpriteAnimationDef { frames, fps, loop }`
  - frame-advance system tied to an `AnimationFrameTickSource`.
- **Tweens** — `TweenDef { target, from, to, durationMs, easing }` +
  system that interpolates and fires `onComplete` events.
- **Skeletal / 2D rigs** — much later; a second consumer must request
  it (likely with a 3D prototype).

**Trigger.** Any prototype with non-static sprites, or any roguelike
feature that wants tweened UI (e.g. damage numbers floating up).
`examples/rpg` is the first sprite-animation consumer (idle→walk→attack
frame cycling — engine-gap-ledger B18); ship the sprite-animation slice
once a second lands.

**Canon.** Unity `Animator`, Godot `AnimationPlayer` / `Tween`, Bevy
`bevy_animation`, GSAP (tweens).

</details>

### `modules/particles` — deferred

**Scope.** `ParticleEmitterDef` + emitter system that spawns
short-lived entities rendered via the existing `RenderableDef`
variants.

<details>
<summary>Details</summary>

**Probable shape.** `ParticleEmitterDef { rate, lifetimeMs, velocity, … }`

- emitter system that spawns short-lived entities (likely consumes
`modules/lifetime`). Rendered via `modules/render-canvas2d` using
existing `RenderableDef` variants — no special particle renderer in v1.

**Trigger — MET (2026-07-15).** Four consumers hand-roll a
`spawnParticle` + radial `burst()` (frogger, jetpack, space-invaders,
asteroids — engine-gap-ledger B8). TTL already ships
(`modules/lifetime`), so the remaining gap is the emitter/burst helper.
Ready to build; not yet scheduled.

**Canon.** Unity `ParticleSystem`, Godot `GPUParticles2D`, Phaser
`ParticleEmitter`.

</details>

### `modules/ui` — speculative

**Scope.** Game-facing UI as ECS — in-world HUDs, damage numbers,
inventory widgets — distinct from `modules/render-canvas2d` and from
app-layer DOM UI.

<details>
<summary>Details</summary>

**Trigger.** A second prototype that needs in-game UI widgets. Today the
roguelike's UI is DOM + app code; snake/asteroids/platformer use the
canvas directly. If a prototype ships world-space HUDs, start planning.

**Rationale for speculative.** ECS-UI is controversial; some engines
(Bevy) do it, others (Unity UGUI, Godot `Control`) keep UI on a
dedicated scene graph. Picking a side speculatively is waste.

**Canon.** Bevy `bevy_ui`, flecs UI addons.

</details>

### `modules/render-dom` V1 — ✅ shipped 2026-04-23

See
[src/modules/render-dom/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/render-dom/README.md)
and plan
[../plans/done/render-dom-module.md](../plans/done/render-dom-module.md).

### `modules/render-dom` V2 — deferred

**Scope.** Follow-ups intentionally excluded from V1: event-driven DOM
updates via lifecycle hooks and higher-level zone/container reparenting
helpers.

<details>
<summary>Details</summary>

**Status.** V1 now ships reusable DOM scaffolding in
`@pierre/ecs/modules/render-dom`: `DomRenderableDef`, `DomRenderer`,
stable `data-entity-id` mapping, orphan cleanup, render-order support,
and per-entity reconcile hooks.

**Trigger.** A second DOM-heavy consumer proving a shared shape for
event-driven updates or container/zone policies.

**Canon.** React reconcilers, Pixi display-list ownership patterns,
Phaser container parenting, custom DOM render loops in card/deckbuilder
web games.

</details>

### `modules/scene-transition` V1 — ✅ shipped 2026-04-23

See
[src/modules/scene-transition/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/scene-transition/README.md)
and plan
[../plans/done/ecs-bootstrap-top6-modules.md](../plans/done/ecs-bootstrap-top6-modules.md).

### `modules/scene` V2 — deferred

**Scope.** Full scene-stack orchestration: bundle-a-world-with-content,
scene push/pop, pause/modal layers, and optional transition effects.

<details>
<summary>Details</summary>

**Status.** V1 now ships the minimal scene-transition slice in
`@pierre/ecs/modules/scene-transition`: tick-boundary transition queue
(`SceneTransitionQueue`) plus `transferEntities` helper. Roguelike
consumes this for descend-time world swap scheduling and cross-world
item transfer while keeping game-specific level generation and event
semantics in app code.

**Trigger.** A second game needing full scene stack semantics (push/pop
modal scenes, separate pause/options scenes, or authored scene lifecycle
policies).

**Canon.** Unity `SceneManager`, Godot scenes, Bevy `States`.

</details>

### `modules/save` V1 — ✅ shipped 2026-04-23

See
[src/modules/save/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/save/README.md)
and plan
[../plans/done/ecs-bootstrap-top6-modules.md](../plans/done/ecs-bootstrap-top6-modules.md).

### `modules/save` V2 — deferred

**Scope.** Higher-level save orchestration not in V1: shared slot-policy
conventions, cross-game metadata schemas, and optional app-payload
composition helpers layered above world serialization.

<details>
<summary>Details</summary>

**Status.** V1 now ships migration and storage primitives in
`@pierre/ecs/modules/save`: `MigrationRegistry`, integrity envelopes,
backup rotation, orphan recovery, and IndexedDB/localStorage backends.
Roguelike persistence now consumes these engine primitives while keeping
its game-specific blob shape and slot/UI semantics in app code.

**Trigger.** Second consumer that needs a shared slot-policy or metadata
convention beyond low-level persistence primitives.

**Canon.** Unity `JsonUtility` + custom save systems, Godot
`ResourceSaver`, Bevy `bevy_save` (community), Phaser scene-data
serialization.

</details>

### `modules/asset-loader` V1 — ✅ shipped 2026-04-24

See
[src/modules/asset-loader/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/asset-loader/README.md)
and plan
[../plans/done/asset-loader-module.md](../plans/done/asset-loader-module.md).

### `modules/asset-loader` V2 — deferred

**Scope.** Higher-level workflows intentionally excluded from V1:
manifest grouping, weighted per-byte progress, and optional dev-time
hot reload hooks.

<details>
<summary>Details</summary>

**Status.** V1 now ships `AssetLoader` with typed handles for image,
audio-buffer, json, text, array-buffer, and font-face loading, plus
URL-keyed cache, in-flight dedupe, and batch progress callbacks.
Top-down-shooter migrated from ad-hoc audio fetch/decode caching to
this module.

**Trigger.** A second consumer needing grouped manifests, byte-level
progress semantics, or automatic dev-time asset refresh.

**Canon.** Unity `Addressables`, Godot `ResourceLoader`, Phaser
`LoaderPlugin`, Bevy `AssetServer`.

</details>

### `modules/tmx` V1 — ✅ shipped 2026-04-24

**Scope.** Pure, DOM-free parser for [Tiled](https://www.mapeditor.org/)
`.tmx` maps — orthogonal, single image-based tileset, `base64`+`zlib`
tile data — plus `gidToFrame` for tileset source-rect lookup. Promoted
on canon (the TMX format) plus its first consumer,
[`examples/tilemap`](../../examples/tilemap/), the first
sprite / texture-atlas consumer. See
[src/modules/tmx/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/tmx/README.md).

This ships the **load/parse** half only. The tile→ECS glue (one sprite
entity per cell, layered via `RenderOrderDef`) deliberately stayed in
the example as one-consumer integration code. A batched tilemap *renderable*
that avoids per-tile entities is the distinct second-consumer concern
tracked below.

### `modules/tilemap` — deferred

**Scope.** `TilemapDef` + matching renderer pass for explicit authored
tile grids (Zelda-likes, Tiled-imported levels). Would consume
`modules/tmx` data but render a whole layer in one batched pass instead
of spawning an entity per cell.

**Trigger update (2026-04-24).** `examples/tilemap` proved the
per-cell-entity approach renders correctly (~10k entities) but is
wasteful; a second authored-tile-grid prototype is the trigger for the
batched renderable.

**Trigger — MET (2026-07-15).** `examples/rpg` is the second
authored-tile-grid consumer (engine-gap-ledger B15): both rpg and tilemap
hand-roll tile→entity auto-spawn + collision-layer derivation. Ready to
build; not yet scheduled.

<details>
<summary>Details</summary>

**Probable shape.** `TilemapDef { widthTiles, heightTiles, tileW, tileH, data }`
with a matching renderer pass. Distinct from the roguelike's `GameMap`
(app-layer, narrative-tile) and distinct from `modules/spatial` (which
indexes entities, not tiles).

**Trigger.** A prototype that has explicit authored levels rendered as
a grid of tiles (e.g. a Zelda-like, a roguelite with handcrafted rooms,
a platformer with Tiled-authored levels). Current platformer uses
procedurally-placed AABB platforms, so it doesn't qualify yet.

**Canon.** Unity `Tilemap`, Godot `TileMap`, Phaser `Tilemap`, Tiled
editor as the external authoring tool (`.tmx` parsing already lands in
`modules/tmx`).

</details>

### `modules/pathfinding` V1 — ✅ shipped 2026-04-22

See
[src/modules/pathfinding/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/pathfinding/README.md)
and plan
[../plans/done/pathfinding-module.md](../plans/done/pathfinding-module.md).

### `modules/pathfinding` V2 — deferred

**Scope.** Additional algorithms (JPS, flow fields, bidirectional,
D\* Lite) and A\* optimizations (path smoothing, binary-heap
open-set) that V1 intentionally omits.

<details>
<summary>Details</summary>

**Trigger.** Each sub-feature promotes on its own ≥2-consumer rule.
Likely first movers: a strategy prototype with many simultaneous
pathers (flow fields), or profile evidence that the linear-scan
open-set is the bottleneck on a real-world map (binary heap).

**Rationale for deferral.** None of the deferred features pay for
themselves at rogue-scale (80×60 grids, single-pather-per-turn
workloads). A\* with linear open-set returns in well under a
millisecond on these maps.

</details>

### `modules/grid-based` V1 — ✅ shipped 2026-04-23

See
[src/modules/grid-based/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/grid-based/README.md)
and plan
[../plans/done/ecs-bootstrap-top6-modules.md](../plans/done/ecs-bootstrap-top6-modules.md).

### `modules/grid-based` V2 — deferred

**Scope.** Additional visibility algorithms and masks not covered by V1:
permissive FOV variants, directional cones, and richer visibility-state
outputs.

<details>
<summary>Details</summary>

**Status.** V1 ships recursive-shadowcasting field-of-view plus
Bresenham-based line-of-sight in `@pierre/ecs/modules/grid-based`, and
the roguelike migrated to it.

**Trigger.** Second consumer needing an algorithm outside V1's shape —
for example stealth cones, faction-shared sight masks, or permissive FOV
tradeoffs.

**Canon.** Unity NavMesh `Raycast`, Godot `RayCast2D` + `VisibleOnScreen`,
broadly: every roguelike framework (libtcod, rot.js) ships FOV as a
first-class primitive separate from pathing.

</details>

### `modules/debug` — deferred

**Scope.** In-game debug overlays — gizmos, entity inspector,
frame-time graphs, system-timing breakdown — dev-build only.

<details>
<summary>Details</summary>

**Probable shape.** Gizmo rendering (show AABBs, show spatial grid,
show FOV cones), a live entity inspector, frame-time / tick-time
graphs, system-timing breakdown. Tree-shaken out of production
builds.

**Trigger.** Enough friction debugging existing prototypes that a
one-off `drawDebug` call inside `Canvas2DRenderer` is no longer enough.
Platformer's static-collision overlay already lives in the example —
when a second consumer wants a similar toggle, it promotes.

**Canon.** Unity `Gizmos` / `Debug.DrawRay`, Godot `Debug` tab,
`dat.gui` / `lil-gui` (DOM-based), Tracy / Optick for native engines.

</details>

### `modules/ai` — speculative

**Scope.** Generalized AI driver components — behavior trees, finite
state machines, GOAP — as selectable components, each with its own
tick system. Distinct from any single game's bespoke AI string-tag.

<details>
<summary>Details</summary>

**Probable shape.** Three sibling components, each with a paired
system: `BehaviorTreeDef`, `FsmDef`, `GoapDef`. Apps pick one (or
compose), and game-specific actions / conditions / leaf nodes register
through a shared registry per kind.

**Trigger.** A second prototype whose AI clearly outgrows ad-hoc
`if`-trees. Recorded consumers: top-down-shooter (constant-speed seek)
and card-battler (AI intent) — engine-gap-ledger B17. That is 2, but the
shapes diverge (real-time steering vs turn intent) and there is no canon
to lean on, so it stays speculative pending convergent evidence — the
genuine rule of three.

**Rationale for speculative.** AI architecture is a contested space —
Unity ships none in core (asset-store dependent), Bevy ships none, Godot
ships an FSM via `AnimationTree` only. Picking a side speculatively is
waste.

**Canon.** Unreal `Behavior Tree` + `Blackboard`, Godot `LimboAI`
(community), Halo / F.E.A.R. GOAP papers, behaviortree.cpp.

</details>

### `modules/networking` — speculative

**Scope.** Client-authority / server-authority replication, delta
compression, lockstep / rollback — layered on top of `EcsWorld.lifecycle`
events and `modules/save` serialization.

<details>
<summary>Details</summary>

**Trigger.** A scoped multiplayer prototype. None is planned. Local
multi-input belongs under the player-slot helper below, not here —
`modules/networking` is for cross-machine sync.

**Rationale for speculative.** Long-horizon. Network code touches every
layer (input, physics determinism, scene transitions, persistence) and
is the wrong thing to design without a real game shape forcing the
constraints.

**Canon.** Bevy `bevy_replicon`, Photon, Mirror (Unity), Source engine
networking model.

</details>

### Local-multiplayer player-slot / input-owner helper — speculative

**Scope.** A small helper for stable local player identity and
routing input to the entity each player controls.

<details>
<summary>Details</summary>

**Trigger.** A second local-multiplayer example beyond local-pong
(engine-gap-ledger B19). Two `createInput`s already work for two players;
only the slot abstraction is missing. Pong kept player identity as the
app-level union `'left' | 'right'`, which was correct for that single
consumer. Don't design from one data point — wait for a second.

**Probable shape.** `PlayerSlotDef { slotId: number }` paired with an
`InputOwnerDef { slotId: number }` so a system can route per-slot
actions from `createInput` to the controlled entity. Slot count and
mapping stays app-defined.

**Canon.** Unity `PlayerInput` + `PlayerInputManager`, Unreal local
player index, Godot `InputMap` action sets.

</details>

---

## Gameplay & utility modules — from the examples audit (2026-07-15)

Promoted from the [engine-gap-ledger](engine-gap-ledger.md) triage pass
(audit findings folded into the ledger). Each entry is **Deferred** with
its consumer tally noted; several have already cleared their promotion
trigger ("MET") and are ready-to-build candidates. Nothing here is
scheduled — promotion records a backlog home and a met bar, it does not
authorise a build.

### `modules/collision` V2 — reflection response — deferred

**Scope.** Resolve a circle/AABB overlap into a corrected position **plus
a reflected velocity** (axis-of-least-penetration bounce), complementing
the shipped `modules/kinematics` push-out which zeroes velocity.

<details>
<summary>Details</summary>

**Trigger — MET (3 consumers).** breakout, local-pong, and frogger
(partial) hand-roll axis-of-least-penetration reflection
(engine-gap-ledger). `modules/kinematics` already does push-out +
velocity-zero (platformer landing), but a bouncing ball needs the
velocity **reflected**, not zeroed — a distinct response.

**Probable shape.** A `resolveReflect(aabb, circle | aabb) => { dx, dy,
nx, ny }` helper (penetration vector + surface normal) the caller
applies to position and uses to flip the velocity component along the
normal. Pairs with the shipped `aabbVsCircle` / `aabbVsAabb` tests.

**Canon.** Arcade bounce in Phaser `Arcade.Physics` (`bounce`), Unity 2D
`PhysicsMaterial2D` bounciness, classic Breakout/Pong reflection.

</details>

### `modules/motion` — vector util (normalize / set-speed) — ✅ shipped 2026-07-15

Shipped `normalize` + `scaleToSpeed`@
[src/modules/motion/vec.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/motion/vec.ts);
see [src/modules/motion/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/motion/README.md#vector-helpers)
and plan [../plans/done/modules-motion-vec.md](../plans/done/modules-motion-vec.md).
Migrated breakout + top-down-shooter (Local→Engine migration #5).

### `modules/motion` — boundary inset / per-entity size — deferred

**Scope.** Extend the shipped `VelocityIntegrationBoundary` so `clamp`
can pin to an inset range `[inset, width−inset]` (or a per-entity
half-extent) instead of only the playfield `[0, width]` point range.

<details>
<summary>Details</summary>

**Trigger — MET (4 consumers).** The shipped `clamp` mode
(`integrateBoundary`@`src/modules/motion/motion.ts:51`, `Bounds =
{ width, height }`@:7) pins the entity's **origin point** to
`[0, width] × [0, height]` — there is no inset or per-entity size. Full-
playfield clampers (asteroids, top-down-shooter) adopt it as-is, but
size/margin-aware clampers hand-roll their own bounded clamp: breakout
paddle (`[half, width−half]`), frogger, local-pong paddles, and
space-invaders cannon all need the sprite's half-width subtracted
(engine-gap-ledger B4 split, 2026-07-15).

**Probable shape.** Add an optional `inset?: number` (uniform) or
`halfExtentOf?: (e) => { x, y }` to the `clamp` branch of
`VelocityIntegrationBoundary`@`motion.ts:15`; the wrap branch is
unaffected. No new component — it rides the existing `boundary` option.

**Canon.** Every paddle/player-confine in arcade engines clamps to the
sprite extent, not the raw playfield edge (Pong, Breakout, Arkanoid,
Space Invaders cannon rails).

</details>

### `modules/timer` — ✅ shipped (2026-07-16)

**Scope.** A Bevy-style `Timer` **value primitive** (not an ECS component):
the shared countdown core that `lifetime`, `cooldown`, and (future)
`spawner` embed.

<details>
<summary>Details</summary>

**Shipped.** `Timer { remainingMs, durationMs, mode, justFinished }` with
`mode: 'once' | 'repeating'`; pure functions `makeTimer`/`tickTimer`/
`finished`/`justFinished`/`fraction`/`restart`@[`timer/timer.ts`](../../src/modules/timer/timer.ts).
`timerSchema` is a flat `SimpleSchema<Timer>` so any module can wrap it in
a `simpleComponent` (lifetime, cooldown both do).

**Why a value, not a `TimerDef` component.** A single `TimerDef` would let
an entity hold only one timer — but a bullet needs a lifetime AND an enemy
needs an i-frame cooldown on the *same* entity slot pattern. Shipping
`Timer` as an embeddable value lets each consumer module define its own
flat component (`LifetimeDef`, `CooldownDef`) that shares the timing core
without colliding. (Bevy's `Timer`/`Stopwatch` split is the precedent.)

**Consumers.** `modules/lifetime` (`Lifetime = Timer`, once-mode),
`modules/cooldown` (`Cooldown = Timer`, once-mode poll/trigger). `spawner`
(#7) will use repeating-mode.

</details>

### `modules/spawner` — deferred

**Scope.** A `SpawnerDef { everyMs, … }` + system that emits an entity on
a cadence, with an optional difficulty-ramp on the interval.

<details>
<summary>Details</summary>

**Trigger — MET (4 consumers).** flappy, jetpack, space-invaders, and
top-down-shooter each hand-roll "emit an entity every T ms, where T
lerps with difficulty" (engine-gap-ledger B2). jetpack's `bulletTimerMs`
auto-emitter (re-homed from the original cooldown scope) lands here too.

**Probable shape.** `SpawnerDef { everyMs, jitterMs?, rampPerSec? }` built
on a **repeating `Timer`** (now shipped) +
`makeSpawnerSystem(spawn: (world) => void)` that fires the callback on
the timer's `justFinished` edge. The *what* to spawn stays app-defined.

**Canon.** Unity coroutine spawners / `InvokeRepeating`, Godot `Timer`
nodes, Phaser `time.addEvent({ loop })`.

</details>

### `modules/cooldown` — ✅ shipped (2026-07-16)

**Scope.** A `CooldownDef` per-entity component + auto-decrement system
covering fire-rate gating and invulnerability/grace i-frames.

<details>
<summary>Details</summary>

**Shipped.** `Cooldown = Timer` (once-mode) wrapped as `CooldownDef`@[`cooldown/cooldown.ts`](../../src/modules/cooldown/cooldown.ts);
`makeCooldown(durationMs)` starts **ready** (remainingMs=0); `ready(c)`
predicate + `trigger(c, durationMs?)` reset; `makeCooldownSystem<TCtx>()`
ticks every `CooldownDef` each frame.

**Shape correction vs. the original deferred note.** The proposed shape
was right (`{ remainingMs, durationMs }` + `makeCooldownSystem` + `ready`/
`trigger`), but it's now built on the shared `Timer` value and ships as a
**per-entity component** — cites `modules/lifetime`'s component precedent
(same-author bias acknowledged). 3 adopters, all poll-`ready()`/`trigger()`
once-mode: asteroids fire@[`input.ts`](../../examples/asteroids/src/systems/input.ts),
top-down-shooter fire@[`input.ts`](../../examples/top-down-shooter/src/systems/input.ts),
space-invaders i-frames@[`systems.ts`](../../examples/space-invaders/src/systems.ts).
jetpack's `bulletTimerMs` is a repeating auto-emitter → **moved to
`modules/spawner`** (#7), not a cooldown.

**Canon.** Unity ability cooldowns, Godot `Timer` one-shots, fighting-
game i-frame windows.

</details>

### `modules/grid-movement` — deferred

**Scope.** Discrete grid/tile movement: step-on-tick, snap-to-cell,
occupancy query, and a 180°-reversal guard. Distinct from the shipped
`modules/grid-based` (which is FOV / line-of-sight only, **not**
movement).

<details>
<summary>Details</summary>

**Trigger — MET (3 consumers).** snake, frogger, and rpg each hand-roll
discrete cell stepping + snapping (engine-gap-ledger B7).

**Probable shape.** `GridPositionDef { col, row }` + a step system that
advances by a queued direction on a movement tick, snapping continuous
position to cell centres, with an occupancy lookup and an opposite-
direction reversal guard (snake's classic constraint).

**Canon.** Godot `TileMap` cell coords + grid-snap movement, roguelike
grid step, classic Snake/Sokoban/Pac-Man movement.

</details>

### `modules/rng` — ✅ shipped 2026-07-15

See
[src/modules/rng/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/rng/README.md)
and plan
[../plans/done/modules-rng.md](../plans/done/modules-rng.md).

### `modules/attach` — deferred

**Scope.** Lightweight follow / carrier attachment: entity B inherits
entity A's per-tick delta (carrier) or tracks A's position/rotation each
frame (follower). The *narrow* slice of parenting, without full
recursive transform propagation.

<details>
<summary>Details</summary>

**Trigger — MET (3 consumers).** frogger (frog riding a moving log/turtle
inherits the carrier's `vx·dt`), asteroids (thrust flame tracks the
ship's pos/rot), and space-invaders (follower) — engine-gap-ledger
(rider row + B12).

**Probable shape.** `AttachDef { to: EntityId, mode: 'carry' | 'follow',
offset? }` + a system that, per tick, either adds the carrier's
position delta (carry — moving platforms, conveyor belts, logs) or sets
pos/rot to the target's plus an offset (follow — turrets, flames, escort
sprites). No dirty-tracking, no cyclic-chain machinery.

**Relation to the declined hierarchy item.** This *re-opens* the
"Entity hierarchy / parenting" Non-goal in its lighter form — see that
entry. The full recursive N-level propagation version stays declined.

**Canon.** Godot `RemoteTransform2D`, Unity simple follow scripts /
`ParentConstraint`, moving-platform rider patterns in every 2D platformer.

</details>

### `modules/rhythm` — speculative

**Scope.** A rhythm-game timing stack: audio-clock `TickSource`,
hit-window judgement, lookahead/absolute-time spawn scheduling, a
timestamped input queue, and latency compensation.

<details>
<summary>Details</summary>

**Trigger.** A second rhythm/timing prototype beyond `examples/rhythm`
(engine-gap-ledger B21). Genre-specific but real and cleanly built; one
consumer is not enough to pin a reusable shape.

**Canon.** Friday Night Funkin' engine, osu! timing, Rhythm Doctor
calibration, Web Audio `AudioContext.currentTime` scheduling patterns.

</details>

### App-host mount / teardown helper — speculative

**Scope.** A thin `start(container) => Teardown` contract with a
lazy-load race guard (stale-load token / CAS) for mount → cleanup →
async-load → teardown orchestration.

<details>
<summary>Details</summary>

**Trigger.** A second app-host beyond `examples/hub` (every example
re-implements `start`/teardown — engine-gap-ledger hub note). Low
priority; the per-example `start` boilerplate is small.

**Canon.** SPA mount/unmount lifecycles, micro-frontend `mount`/
`unmount` contracts (single-spa), React root `createRoot`/`unmount`.

</details>

---

## Non-goals (declined)

Items deliberately rejected, not just deferred — recorded so future
"should we build X?" questions have an answer.

<details>
<summary>Entity hierarchy / parenting (full transform propagation)</summary>

Bevy-style `Parent(Entity)` / `Children` with recursive transform
propagation.

**Still declined — full version only.** General N-level transform
propagation bakes a cost (dirty tracking, cyclic-reference guards,
lifetime cascade rules) into every game whether or not it uses it.

**Narrowed (2026-07-15).** The *lightweight* follow/carrier slice —
"entity B inherits entity A's per-tick delta, or tracks its pos/rot" —
is no longer declined: it reached 3 consumers (frogger rider, asteroids
thrust-flame, space-invaders follower) and promoted to the deferred
`modules/attach` entry above. That covers the real demand without the
full propagation machinery. The full recursive-hierarchy version stays
declined until a prototype genuinely needs deep parent chains.

</details>

<details>
<summary>Scoring / lives / game-over scaffold</summary>

A shared score / lives / game-over-state module.

**Declined (2026-07-15).** Surfaced in nearly every example
(engine-gap-ledger B14), but it is *content*, not engine: each game's
scoring rules, life count, and game-over semantics differ and live
naturally in app state. The engine already ships the primitives these
need (`EventBus` for score events, `modules/save` for high scores). No
reusable shape to extract.

</details>

<details>
<summary>Visual editor / inspector as part of the engine</summary>

Unity / Unreal / Godot editor as core engine feature.

**Declined.** This is a code-first engine. A dev-mode inspector panel
belongs in `modules/debug` (scope: diagnose, not author). Persistent
authoring lives in content files + code, per the established
content-registration pattern.

</details>

<details>
<summary>Generic asset pipeline / build plugin</summary>

Texture packer, audio compressor, atlas builder integrated with the
build system.

**Declined.** Vite covers the current scale. If a game ships large
asset volumes, point it at an external tool (TexturePacker, ffmpeg)
invoked by a `package.json` script — no engine involvement needed.

</details>

<details>
<summary>Multi-threading / worker-based parallelism</summary>

Rayon-style parallel system execution.

**Declined for now.** JavaScript's cooperative concurrency model and
the single-threaded-per-context reality mean workers require
explicit `structuredClone` across boundaries. For the games this
engine targets (roguelike + 2D prototypes), single-threaded is plenty.
Revisit if a prototype ships that's genuinely CPU-bound on the main
thread.

</details>

---

## Promotion triggers — summary

When any of the below becomes true, open a plan for the matching module.

| Signal | Unblocks |
|---|---|
| Scrolling prototype with zoom / clamping / parallax, or snake migration | `modules/camera` V2 (also unblocks snake ↔ render-canvas2d) |
| Asset-loader lands + sprite-rendering prototype | `RenderableDef` sprite/texture variant (V3) |
| 3D prototype scoped | All 3D sibling modules |
| Stacking / ragdoll / vehicle prototype | Rigid-body physics |
| Spatialized playback or shared bus-driven audio events in a second consumer | `modules/audio` V2 |
| Sprite animation or tween in any prototype | `modules/animation` |
| Second app with multiple runtime worlds and full scene stack needs | `modules/scene` V2 |
| Second app needing shared slot metadata/policy conventions | `modules/save` V2 |
| Asset volume exceeds Vite import comfort | `modules/asset-loader` |
| Flow-field / many-pather prototype | `modules/pathfinding` V2 |
| Stealth / line-of-sight prototype needing non-V1 algorithms | `modules/grid-based` V2 |
| Second debug-overlay consumer | `modules/debug` |
| Second prototype with non-trivial AI (BT / FSM / GOAP) | `modules/ai` |
| Scoped multiplayer prototype | `modules/networking` |
| Second local-multiplayer example beyond local-pong | Local-multiplayer player-slot helper |
| **MET** — 3rd continuous→cell projection consumer | `ContinuousHashGrid2D` |
| **MET** — bounce/reflection response in 3 consumers | `modules/collision` V2 (reflection) |
| **MET** — timed spawn cadence in 4 consumers | `modules/spawner` |
| ✅ **SHIPPED 2026-07-16** — cooldown / grace timer (3 poll/trigger consumers) | `modules/cooldown` (+ `modules/timer` core) |
| **MET** — discrete grid movement in 3 consumers | `modules/grid-movement` |
| **MET** — follow/carrier attach in 3 consumers | `modules/attach` |
| **MET** — FX bursts in 4 consumers | `modules/particles` |
| **MET** — renderer camera-consume / off-screen cull in 2 consumers | `modules/camera` V2 |
| **MET** — screen-space HUD/overlay in 2 consumers | `RenderableDef` V3 overlay |
| **MET** — 2nd authored tile-grid (auto-spawn) | `modules/tilemap` |
| Rhythm/timing prototype beyond `examples/rhythm` | `modules/rhythm` (speculative) |
| Second app-host beyond `examples/hub` | App-host helper (speculative) |

Every promotion still runs through the engine extension rule-book
(the sliding-scale evidence rule) — this table just
catalogs the
likely first signals.
