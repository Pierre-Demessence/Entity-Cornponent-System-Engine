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

Every entry follows the same rule: a module ships when **Path-A** (rule
of three — three internal consumers), **Path-B** (one internal
consumer + external canon), or **Path-C** (universal canon, zero
consumers required) is satisfied. Nothing ships speculatively. See
[https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/extending-the-engine.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/extending-the-engine.md)
for the full rule-book including Path-C guardrails.

---

## Deferred 2D modules

### `modules/camera` V1 — ✅ shipped 2026-04-21

See
[src/modules/camera/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/camera/README.md)
and plan
[../plans/done/ecs-camera-module.md](../plans/done/ecs-camera-module.md).

### `modules/camera` V2 — deferred

**Scope.** Features deliberately left out of V1: zoom, rotation,
deadzone, clamping, parallax, and pixel/tile helpers.

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
adds a layer model, rotation adds a matrix-math hot path. Path-A /
Path-B promotion from a single consumer is how each lands.

</details>

### `RenderableDef` extensions V2 — ✅ shipped 2026-04-22

See
[src/modules/render-canvas2d/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/render-canvas2d/README.md)
and plan
[../plans/done/render-canvas2d-v2.md](../plans/done/render-canvas2d-v2.md).

### `RenderableDef` extensions V3 — deferred

**Scope.** Extensions to the `RenderableDef` union and
`Canvas2DRenderer` not covered by V2: sprite/texture variant,
tilemap variant, Canvas filters.

<details>
<summary>Details</summary>

**Sprite / texture variant.** Path-C on shape (canon unanimous
across Pixi `Sprite`, Phaser `Image` / `Sprite`, Unity
`SpriteRenderer`, Bevy `SpriteBundle`). Blocked on `modules/asset-loader`
— shipping a sprite primitive before there's a way to load image
assets is premature.

**Tilemap variant.** Path-A. No internal consumer yet; snake's
cell-based rendering currently goes through `rect`.

**Canvas filters (`ctx.filter`).** Path-A. Blur, drop-shadow and
similar post-processing effects are rarely used in practice;
wait for a concrete request.

**Snake ↔ `modules/render-canvas2d` migration.** Separately tracked
under `modules/camera` V2 — blocked on V2 zoom so `Canvas2DRenderer`
can apply the `cells → pixels` transform instead of every
renderable multiplying by `CELL` by hand.

</details>

### `ContinuousHashGrid2D(cellSize)` — deferred

**Scope.** Convenience wrapper around `HashGrid2D` + `cellOfPoint` /
`cellsForAabb` / `cellsForCircle` so callers don't project continuous
positions to cells by hand.

<details>
<summary>Details</summary>

**Trigger.** The manual projection pattern demonstrably hurts —
currently asteroids and platformer both find it ergonomic. Third
consumer or a reported pain point unblocks.

**Rationale.** Path-B deferral; the composition-in-app pattern is
explicit and debuggable, the wrapper would only hide one function call.

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

**Trigger.** Second prototype that wants visual juice (explosions, dust,
impact sparks). Asteroids currently uses ad-hoc spawned entities for the
death burst — if a second consumer does the same, Path-A promotes.

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
Path-B from [`examples/tilemap`](../../examples/tilemap/), the first
sprite / texture-atlas consumer. See
[src/modules/tmx/README.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/modules/tmx/README.md).

This ships the **load/parse** half only. The tile→ECS glue (one sprite
entity per cell, layered via `RenderOrderDef`) deliberately stayed in
the example as Path-A integration code. A batched tilemap *renderable*
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
when a second consumer wants a similar toggle, Path-A promotes.

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
`if`-trees. Today the roguelike's AI is a string + target ID, and the
three real-time prototypes don't have AI at all. Path-A: ship one shape
only when ≥2 internal consumers converge.

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

**Trigger.** A second local-multiplayer example beyond local-pong.
Pong kept player identity as the app-level union `'left' | 'right'`,
which was correct for that single consumer. Path-A: do not design
from one data point.

**Probable shape.** `PlayerSlotDef { slotId: number }` paired with an
`InputOwnerDef { slotId: number }` so a system can route per-slot
actions from `createInput` to the controlled entity. Slot count and
mapping stays app-defined.

**Canon.** Unity `PlayerInput` + `PlayerInputManager`, Unreal local
player index, Godot `InputMap` action sets.

</details>

---

## Non-goals (declined)

Items deliberately rejected, not just deferred — recorded so future
"should we build X?" questions have an answer.

<details>
<summary>Entity hierarchy / parenting</summary>

Bevy-style `Parent(Entity)` / `Children` with transform propagation.

**Declined.** The roguelike and all three prototypes are flat. Parenting
bakes a cost (transform-propagation dirty tracking, cyclic-reference
guards, lifetime rules) into every game whether or not it uses the
feature. Ship only if a prototype genuinely needs it — and then
carefully.

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
| Second prototype with FX bursts | `modules/particles` |
| Second app with multiple runtime worlds and full scene stack needs | `modules/scene` V2 |
| Second app needing shared slot metadata/policy conventions | `modules/save` V2 |
| Asset volume exceeds Vite import comfort | `modules/asset-loader` |
| Authored tile-grid level in any prototype | `modules/tilemap` |
| Flow-field / many-pather prototype | `modules/pathfinding` V2 |
| Stealth / line-of-sight prototype needing non-V1 algorithms | `modules/grid-based` V2 |
| Second debug-overlay consumer | `modules/debug` |
| Second prototype with non-trivial AI (BT / FSM / GOAP) | `modules/ai` |
| Scoped multiplayer prototype | `modules/networking` |
| Second local-multiplayer example beyond local-pong | Local-multiplayer player-slot helper |

Every promotion still runs through the engine extension rule-book
(Path-A, Path-B canon, or Path-C universal canon) — this table just
catalogs the
likely first signals.
