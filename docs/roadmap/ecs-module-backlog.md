# ECS Module Backlog

**Open module work only.** An entry here is a module (or a slice of one) that
does not exist yet. Nothing in this file is scheduled — each entry records a
*shape* and the *trigger* that would justify building it.

Shipped work does not live here. Once a module ships it is described by
`src/`, dated by `git log`, and explained by its `plans/done/` plan or its
`src/modules/<name>/README.md`. A status doc that also lists finished work is
a cache of `git log` that nothing invalidates, so it drifts.

Related:

- [core-engine-roadmap.md](core-engine-roadmap.md) — open core-internals work
- [non-goals.md](non-goals.md) — declined and superseded (terminal, not
  deferred)
- [engine-gap-ledger.md](engine-gap-ledger.md) — raw gaps from the examples,
  awaiting triage
- [../archived/prototype-games-roadmap.md](../archived/prototype-games-roadmap.md)
  — proof-via-prototypes ladder

## Conventions

### Status vocabulary

- **Deferred** — planned shape is clear; waiting on a concrete trigger
  (consumer, pain, or prototype).
- **Speculative** — shape is sketched but would only exist if a specific
  class of game is attempted.

Two more statuses exist but are not backlog states, so they live elsewhere:
**Shipped** (the module exists — `src/` + `git log`) and **Declined** /
**Superseded** (terminal — [non-goals.md](non-goals.md)).

### Entry shape

Each entry opens with a **Scope** one-liner and carries a **Trigger** — the
concrete event that would justify building it. When a sketched API exists it
appears inside the details as **Probable shape**. Canon (what other engines
do) is cited where it exists; novel shapes need internal consumers instead.

### Version suffixes (V1 / V2 / …)

When a module ships but parts of its originally-imagined scope are
deliberately left out, the shipped slice becomes **V1** and a sibling **V2**
entry captures what was left. Each further round increments: V3, V4. This
keeps shipped work out of the file while the open remainder stays visible.

### Engine extension rule-book

Every entry follows the same sliding-scale rule: a module ships once its
*shape* is proven, where internal consumers and external canon are
interchangeable evidence — unanimous universal canon needs **0** consumers,
solid canon **1**, and a novel/opinionated shape **2** (the genuine rule of
three). Nothing ships speculatively. See
[extending-the-engine.md](../extending-the-engine.md) for the full rule-book
and guardrails.

---

## Deferred 2D modules

### `RenderableDef` extensions V3 — deferred

**Scope.** Three remaining `Renderable` gaps: **composite renderables**
(one entity drawing several primitives, so `Renderable` stops being one
drawable per entity), a **billboard sprite** (a camera-facing textured quad
for a 2D sprite in a 3D world), and the original last item, **Canvas
filters** (`ctx.filter`) — blur, drop-shadow and similar post-processing.

**Trigger.** Composite: a second consumer beyond flappy's pipe pairs.
Billboard: doom is the only consumer and three.js `Sprite` covers it today.
Canvas filters: a concrete request — these effects are rarely used in
practice.

<details>
<summary>Details</summary>

**Composite.** `Renderable`@`src/modules/render-canvas2d/renderable.ts` is a
single discriminated union — one `kind` per entity — so multi-part sprites
(flappy's pipe pairs) are hand-drawn instead of going through the renderer.
1 consumer.

**Billboard.** doom draws each enemy as a `THREE.Sprite`@`examples/doom/src/render.ts:123`
(auto-faces the camera, `alphaTest` for the transparent background). The 2D
renderers have no analogue, and three.js supplies it for free — so this is an
engine-shape question, not a missing capability.

Two related items are *not* here: the sprite/texture variant and GID flip
bits shipped, and the batched tilemap renderable is tracked as
`modules/tilemap` V2 (that entry owns the whole feature, renderer pass
included).

**Snake ↔ `modules/render-canvas2d` migration — also still open.** The
`view`/zoom hook exists, so snake needs to adopt a `CameraDef` zoom instead
of baking the `cells → pixels` scale into every renderable by hand. Tracked
with the camera V3 entry.

</details>

### `modules/kinematics` V2 — slopes + one-way platforms — deferred

**Scope.** Two surface behaviours the arcade body solver lacks: **slopes**
(walk a non-axis-aligned surface with the body following its normal) and
**one-way platforms** (solid from above, pass-through from below).

<details>
<summary>Details</summary>

**Trigger.** A platformer prototype that needs them. None does yet —
`examples/platformer` uses procedurally-placed AABB platforms — but ladder
entries #15/#16/#17 (Mario Bros, Pitfall, VVVVVV) all do, and
[engine-readiness-assessment.md](../engine-readiness-assessment.md) names
both as Hollow Knight's load-bearing blocker.

**Evidence.** ABSENT, confirmed in `src/`: a grep of `src/modules/**` finds no
`oneWay` or slope handling in `collision` or `kinematics`; the only `slope`
matches are shadowcasting math in `grid-based/visibility.ts:45`.

**Probable shape.** One-way is a per-collider flag consulted in the axis
sweep (skip the contact when the mover approaches from the disabled side).
Slopes need the sweep to become normal-aware, or an explicit slope resolver
after it. `kinematics-3d` gets them separately.

**Canon.** Unity `PlatformEffector2D`, Godot `CharacterBody2D` one-way
collision, GameMaker, every Celeste-lineage platformer tutorial.

</details>

### `modules/tick` V2 — fixed-timestep accumulator + interpolation — deferred

**Scope.** A tick source that consumes real elapsed time, advances the world
at a fixed `dt` with catch-up steps, and exposes an interpolation factor so
the renderer can draw between the last two simulation states.

<details>
<summary>Details</summary>

**Trigger.** A game whose physics needs frame-rate-independent determinism at
a varying display rate. Both shipped sources deliberately sidestep it:
`AnimationFrameTickSource` emits variable dt@`src/modules/tick/animation-frame-tick-source.ts:27`
and its own docs say consumers needing catch-up "layer an accumulator on
top"; `FixedIntervalTickSource` is *nominal* fixed dt@`src/modules/tick/fixed-interval-tick-source.ts:7`.

**Probable shape.** `FixedAccumulatorTickSource { fixedDtMs, maxStepsPerFrame }`
yielding `{ dt, alpha }` — systems keep reading a fixed `dt`, the renderer
lerps by `alpha`. The spiral-of-death clamp (`maxStepsPerFrame`) is the
load-bearing detail, not the loop.

**Canon.** Godot `_physics_process` + `Engine.physics_ticks_per_second`,
Unity `FixedUpdate` + `Rigidbody.interpolation`, Bevy `FixedUpdate`.

</details>

### `modules/motion` V2 — force fields (point attractor) — deferred

**Scope.** A reusable "accelerate every body toward point P" force — the
radial/attractor case, as distinct from constant-directional gravity.

<details>
<summary>Details</summary>

**Trigger.** A second *radial* consumer. spacewar is the only one: it
hand-rolls an inverse-square field toward the star with a minimum-radius
clamp (`force = STAR_GRAVITY / r2`@`examples/spacewar/src/systems/gravity.ts:52`,
clamp @:49). flappy / jetpack / platformer-3d hand-roll constant
`vel.vy += G*dt`, which is a one-liner and **not** the same shape.

**Related row closed with this entry.** The ledger's out-of-bounds respawn
(kill-plane) row is declined, not promoted — portal and doom each check
`y < RESPAWN_Y` in `onBeforeFlush`, which is a one-liner, not a force. See
[non-goals.md](non-goals.md).

**Canon.** Constant-directional gravity ships in every integrator; radial
fields are usually a game-side force accumulator (Unity `Rigidbody.AddForce`
with a computed direction, Godot `Area2D` gravity point).

</details>

### `modules/input` event-mode variant — deferred

**Scope.** Event-driven action dispatch for turn-based games (single
keypress = single turn), complementary to the shipped poll-on-tick
`createInput`.

<details>
<summary>Details</summary>

**Probable shape.** An `EventInput<TAction>` that wraps `InputProvider`,
applies the same `InputMap`, and dispatches to a subscriber callback on the
keydown edge.

**Trigger.** A second turn-based consumer of `@pierre/ecs` appears, OR a
deliberate decision to design event-mode proactively to unblock the
roguelike migration.

**Rationale.** The shipped `createInput` is calibrated for real-time games
(snake / asteroids / platformer): poll-based, flat-action enum,
`KeyboardEvent.code` (layout-independent, no modifier awareness). The
roguelike's input is event-driven (keydown emits the turn-action
immediately), action-with-payload (move dx/dy), and uses `KeyboardEvent.key`
(so `>` for descend works as Shift+Period on a US layout without explicit
modifier tracking). Forcing the roguelike onto `createInput` either produces
glue code that fights the engine model (split move into 4 directional
actions, manually combine `ShiftLeft`+`Period` for `>`, run a tick loop just
to poll), or settles for using `KeyboardProvider` only and bringing the
entire mapping layer back in-app — which saves ~5 lines and is not a real
win. The honest split is `createInput` for real-time, `EventInput` for
turn-based. Until then, the roguelike keeps its existing `src/ui/input.ts`
mapping layer and DOM listeners — the right shape for that game.

</details>

### `modules/camera` V3 — rotation + parallax layers — deferred

**Scope.** Two things V2 deliberately left out of the canon-complete 2D
camera: **rotation** (Godot `Camera2D.rotation`) and **parallax layers** (a
layer / scroll-factor model).

<details>
<summary>Details</summary>

**Rotation.** A rotated view needs a full affine transform plus a
*conservative* rotated-AABB cull — the shipped cull is axis-aligned. 2D
top-down and platform games rarely rotate the camera, so this waits.

**Parallax.** Its own follow-up shape rather than a camera flag: a layer list
with per-layer scroll factors, which the renderer would consume alongside
`view`.

**Related open item — snake's `CameraDef` adoption.** The V2 `view`/zoom hook
exists; snake still bakes the `cells → pixels` scale into every renderable by
hand instead of adopting a camera zoom.

**Pixel/tile helpers** stay in app code (DOM/canvas-specific) — also
deliberate, but not deferred work.

</details>

---

## 3D siblings — speculative

**Scope.** Parallel 3D-dimension modules (transform, motion, collision,
kinematics, render-webgl/webgpu, camera-3d, navmesh-3d) that ship alongside
the 2D stack rather than replacing it.

<details>
<summary>Details</summary>

Forward-looking per the 2D-vs-3D strategy in the shipped plan: when 3D lands,
dimension-sensitive modules ship as **parallel siblings**, not extensions or
renames (Godot / flecs model). All entries below exist only if a 3D prototype
is attempted, and none is scheduled.

| Module | Shape | Canon |
|---|---|---|
| `modules/transform-3d` | `Position3DDef {x,y,z}`, quaternion `Rotation3DDef`, `ScaleDef` | Bevy `Transform`, Unity, Godot `Node3D` |
| `modules/motion-3d` | 3-vector velocity integrator + optional 3D bounds; free-flight attitude control (rate-steered orientation + throttle) | Bevy integrators |
| `modules/collision-3d` | `ShapeAabb3Def`, `ShapeSphereDef`, optional `ShapeObbDef`; AABB3 / sphere / OBB narrowphase | Bevy `bevy_rapier3d`, PhysX primitives |
| `modules/kinematics-3d` | Arcade 3D character controller — gravity + axis-separated resolution against statics | Unity `CharacterController`, Godot `CharacterBody3D` |
| `modules/render-scene3d` | entity ↔ scene-object sync: create / update / reap by tag — the 3D analogue of `Canvas2DRenderer` | three.js scene graphs, Babylon `Scene` |
| `modules/navmesh-3d` | Triangle-mesh navigation: bake, regions, links, agent-radius inflation. 2D sibling: `modules/navmesh` | Recast/Detour, Godot `NavigationRegion3D`, Unity `NavMesh` |
| `modules/render-webgl` | `Renderer<TCtx>` implementation backed by WebGL | three.js, Babylon |
| `modules/render-webgpu` | Same interface, WebGPU backend | Bevy WGPU, three.js WebGPU renderer |
| `modules/camera-3d` | Projection (perspective + ortho), frustum, view matrix, and the rig family — first-person look, orbit, third-person chase (smoothed, slerped) | Bevy `Camera3dBundle`, Unity `Camera`, Godot `Camera3D` |

**Trigger for the whole group.** A scoped 3D prototype (matches the
[prototype ladder](../archived/prototype-games-roadmap.md) — 3D platformer or
similar). Until then, the 2D stack is the only stack. The gap ledger already
records the duplicated work, which makes this the largest de-facto demand
cluster in the file: **4 consumers** hand-roll the entity↔mesh sync
(platformer-3d, portal, doom, starfighter), **3** the 3D AABB solver
(platformer-3d, portal, doom), and **2** a ray-vs-AABB test.

**Rules (re-affirmed from the shipped plan).**

- Do not add `z` to `PositionDef`. Breaks `HashGrid2D`, every query, and the
  2D contract.
- Do not preemptively rename `PositionDef` → `Position2DDef`. Retroactive
  rename only if mixed 2D/3D games prove it ambiguous.
- `SpatialStructure<TPos>` already generic in core — a future `HashGrid3D`
  ships as another backend with zero core change. That's why spatial is
  dimension-agnostic and isn't duplicated above.

</details>

---

## Rigid-body physics — speculative

**Scope.** Full rigid-body simulation (mass, restitution, constraints,
continuous collision across many dynamic bodies) distinct from the shipped
arcade `modules/kinematics`.

<details>
<summary>Details</summary>

**Probable shape.** Either roll our own (AABB-only, minimal) or adapt
`planck.js` / `rapier-js`. Integrates with `SpatialStructure` via a
physics-appropriate backend (BVH / SweepAndPrune).

**Trigger.** A prototype that arcade physics genuinely cannot handle —
stacking crates with realistic settle, rope / chain, jointed ragdoll,
soft-body, vehicles with suspension.

**Rationale for deferral.** Arcade covers platformers, top-down action,
twin-stick shooters, and puzzle-physics-lite. Full physics is a large ongoing
commitment (authoring tools, debug viz, determinism tuning) and should not be
spent without a game design that demands it.

</details>

---

## Standard engine modules

Every mature engine eventually ships these. Listed with scope sketches so
"what would this even look like" is not a greenfield question when the time
comes.

### `modules/audio` V2 — deferred

**Scope.** Audio features deliberately excluded from V1: spatial listener
modeling, event adapters for bus-driven one-shots, and clip loading
orchestration with `modules/asset-loader`.

<details>
<summary>Details</summary>

**Trigger.** A second consumer needs listener-aware playback or shared event
wiring conventions, OR asset loading lands and two apps need the same
clip-binding flow.

**Canon.** Unity `AudioSource` / `AudioListener`, Godot `AudioStream*`, Phaser
`SoundManager`, Bevy `bevy_audio`.

</details>

### `modules/animation` V2 — deferred

**Scope.** What V1 left out: a **clip registry** (named animation clips shared
across entities, lookup by key, playback control) and, much later, **skeletal
/ 2D rig** animation.

<details>
<summary>Details</summary>

**Trigger (clip registry).** A second consumer needing shared named clips. V1
ships the per-entity `SpriteAnimationDef` only.

**Trigger (skeletal).** Much later; a second consumer must request it (likely
alongside a 3D prototype).

**Also open — `TweenDef` ECS component.** No consumer animates via a component
(they read `tweenValue` inline), and the ECS-wrapper shape isn't single-canon
(Godot node vs DOTween fluent chain). Ships only if a consumer wants the
component form.

</details>

### `modules/ui` — speculative

**Scope.** Game-facing UI as ECS — in-world HUDs, damage numbers, inventory
widgets — distinct from `modules/render-canvas2d` and from app-layer DOM UI.

<details>
<summary>Details</summary>

**Trigger.** A second prototype that needs in-game UI widgets. Today the
roguelike's UI is DOM + app code; snake/asteroids/platformer use the canvas
directly. If a prototype ships world-space HUDs, start planning. The
capability assessment ranks UI as the **most frequently missing surface**
across the five commercial-scale targets.

**Rationale for speculative.** ECS-UI is controversial; some engines (Bevy) do
it, others (Unity UGUI, Godot `Control`) keep UI on a dedicated scene graph.
Picking a side speculatively is waste.

**Canon.** Bevy `bevy_ui`, flecs UI addons.

</details>

### `modules/dialogue` — speculative

**Scope.** The presenter + runner **seam** only: a `DialogueRunner` contract
(`advance()` → next step, `choose(index)`) and a `DialoguePresenter`
interface (show a line, show choices, close). **No narrative language, no
script format, no VM** — those stay app-side.

<details>
<summary>Details</summary>

**Trigger.** A narrative prototype needing *branching* dialogue — choices, or
lines gated on world state. `examples/rpg` is the only consumer and it is
strictly linear: a flat per-NPC line array
(`NpcDialogue { name; dialog: string[]; gid }`@`examples/rpg/src/characters.ts:63`)
advanced one box at a time by a hand-rolled DOM presenter
(`DialogueBox`@`examples/rpg/src/dialogue.ts:6` — `start` / `advance` /
`open`). rpg exercises the presenter half and the advance case; nothing
exercises the `DialogueStep` union, and `choices` / world-gated lines are the
part that has to be right — a linear consumer cannot reveal whether that
model holds.

**Probable shape.**

```ts
type DialogueStep =
  | { kind: 'line'; speaker: string; text: string }
  | { kind: 'choices'; choices: readonly string[] }
  | { kind: 'end' };

interface DialogueRunner {
  advance(): DialogueStep;
  choose(index: number): void;
}
```

The engine ships the interface; the app supplies the presenter and adapts
whatever script format it chose.

**Rationale for the seam, not a runtime.** Ink and Yarn Spinner each ship
their own authoring language *and* VM, and they are different authoring
models — a nested weave is not a node graph. Bundling one makes a
narrative-tooling choice for every consumer and drags a VM into the engine's
dependency graph, which collides with the tree-shakeable-module invariant.
The part every consumer actually duplicates is the seam — drive a story →
show a box → lock input — which is exactly what rpg hand-rolls today.

**Canon, at its verified strength.** Ink's runtime API is the one shape
checked first-hand — `Continue()` / `currentChoices` /
`ChooseChoiceIndex(i)`, behind the authoring `.ink` → `inklecate` → compiled
JSON pipeline (Ink and inkjs READMEs). Yarn Spinner is a second dialogue
system with the same authoring → runtime → presenter split, but its compiler
and VM are C#/.NET with **no first-party JS runtime** for this stack, and its
runtime API was not opened in this pass. That is *one verified runtime plus
one authoring-pipeline precedent* — short of the ≥3-engine unanimity the
rule-book needs to promote on canon alone, and the step model is opinionated
besides. Hence **speculative**: the shape is sketched, and it exists if a
narrative-heavy prototype is attempted.

**Not `modules/ui`.** That entry is in-world ECS widgets; this one is
app-layer presentation plus a runner contract.

</details>

### `modules/render-dom` V2 — deferred

**Scope.** Follow-ups intentionally excluded from V1: event-driven DOM updates
via lifecycle hooks and higher-level zone/container reparenting helpers.

<details>
<summary>Details</summary>

**Trigger.** A second DOM-heavy consumer proving a shared shape for
event-driven updates or container/zone policies.

**Canon.** React reconcilers, Pixi display-list ownership patterns, Phaser
container parenting, custom DOM render loops in card/deckbuilder web games.

</details>

### `modules/lighting` — speculative

**Scope.** 2D lighting: light sources with radius/cone/falloff, occluders
that cast shadows, and a light-accumulation pass the renderer blends over
the world.

<details>
<summary>Details</summary>

**Trigger.** A game that is *about* darkness or light — stealth visibility,
cave crawling, day/night mood. No consumer yet: nothing in `examples/`
hand-rolls a light pass. `modules/grid-based` visibility is the related but
different capability (what the *player* can see on a grid, not what the
*renderer* lights).

**Evidence.** ABSENT in `src/`: a grep for `Light2D`/lighting finds only
`castLight` shadowcasting in `grid-based/visibility.ts:88`. The Canvas2D
renderer has no blend-mode lighting pass.

**Rationale for speculative.** [engine-readiness-assessment.md](../engine-readiness-assessment.md)
names it for Hollow Knight ("Lighting, shaders, post-FX — Canvas2D only"),
but no prototype has needed it. Building it speculatively means guessing a
light model (simple radial? normal-mapped?) with no consumer to validate it.

**Canon.** Godot `Light2D` + `LightOccluder2D`, Unity 2D Lights (URP),
Phaser's `Light2D` pipeline.

</details>

### `modules/scene` V2 — deferred

**Scope.** Full scene-stack orchestration: bundle-a-world-with-content, scene
push/pop, pause/modal layers, and optional transition effects.

<details>
<summary>Details</summary>

**Trigger.** A second game needing full scene stack semantics (push/pop modal
scenes, separate pause/options scenes, or authored scene lifecycle policies).
V1 ships only the tick-boundary transition queue (`SceneTransitionQueue`) plus
`transferEntities`.

**Canon.** Unity `SceneManager`, Godot scenes, Bevy `States`.

</details>

### `modules/timeline` — speculative

**Scope.** Sequenced multi-track playback — "do A, wait 0.5 s, then B and C
together" — where the tracks drive tweens, camera moves, dialogue steps, and
app callbacks off one clock.

<details>
<summary>Details</summary>

**Trigger.** A prototype with a scripted sequence: an intro fly-in, a boss
reveal, a scripted camera. No consumer yet.

**Why nothing shipped covers it.** `modules/tween` animates a *single*
scalar (`tweenValue` / `tickTween` / `tweenDone` / `resetTween`) and leaves
composition to the caller. `modules/scene-transition` is a tick-boundary
transition *queue*, not a timeline. A sequence therefore means hand-nesting
completion callbacks in app code.

**Probable shape.** A clip list with `{ startMs, durationMs, track }` and one
`tickMs` advance. Tracks are adapters, so a tween track, a camera track and a
dialogue track are each ~20 lines — the engine ships the clock and the clip
list, not the clip kinds.

**Related.** The natural partner to `modules/dialogue`: a cutscene is a
timeline whose tracks include dialogue steps, which is why the dialogue entry
scopes itself to the runner/presenter seam and leaves sequencing here.

**Canon.** Unity Timeline, Godot `AnimationPlayer` + `AnimationTree`, Unreal
Sequencer.

</details>

### `modules/save` V2 — deferred

**Scope.** Higher-level save orchestration not in V1: shared slot-policy
conventions, cross-game metadata schemas, and optional app-payload composition
helpers layered above world serialization.

<details>
<summary>Details</summary>

**Trigger.** Second consumer that needs a shared slot-policy or metadata
convention beyond the low-level persistence primitives.

**Canon.** Unity `JsonUtility` + custom save systems, Godot `ResourceSaver`,
Bevy `bevy_save` (community), Phaser scene-data serialization.

</details>

### `modules/asset-loader` V2 — deferred

**Scope.** Higher-level workflows intentionally excluded from V1: manifest
grouping, weighted per-byte progress, and optional dev-time hot reload hooks.

<details>
<summary>Details</summary>

**Trigger.** A second consumer needing grouped manifests, byte-level progress
semantics, or automatic dev-time asset refresh.

**Canon.** Unity `Addressables`, Godot `ResourceLoader`, Phaser `LoaderPlugin`,
Bevy `AssetServer`.

</details>

### `modules/tilemap` V2 — batched renderable — deferred

**Scope.** `TilemapDef { widthTiles, heightTiles, tileW, tileH, data }` plus a
matching renderer pass, so a whole layer draws in one batched pass instead of
one entity per cell.

<details>
<summary>Details</summary>

**Rationale.** V1 spawns a sprite entity per non-empty tile — proven correct
at ~10k entities (`examples/tilemap`) but wasteful in entity count, query
cost, and draw calls. A batched renderable is the canonical fix (Unity
`Tilemap`, Godot `TileMap`, Phaser `Tilemap`).

**Probable shape.** `TilemapDef { widthTiles, heightTiles, tileW, tileH, data }`
with a matching renderer pass. Distinct from the roguelike's `GameMap`
(app-layer, narrative-tile) and from `modules/spatial` (which indexes
entities, not tiles).

**Trigger.** A prototype whose authored tile grid is large enough that
per-cell entities measurably hurt. `examples/tilemap` already bakes its static
~10k-tile map to one offscreen bitmap — the consumer-side workaround this
would replace. Current platformer uses procedurally-placed AABB platforms, so
it doesn't qualify.

**Canon.** Unity `Tilemap`, Godot `TileMap`, Phaser `Tilemap`, with Tiled as
the external authoring tool (`modules/tmx` already parses it).

</details>

### `modules/pathfinding` V2 — deferred

**Scope.** Additional algorithms (JPS, flow fields, bidirectional, D\* Lite)
and A\* optimizations (path smoothing, binary-heap open-set) that V1
intentionally omits.

<details>
<summary>Details</summary>

**Trigger.** Each sub-feature promotes on its own ≥2-consumer rule. Likely
first movers: a strategy prototype with many simultaneous pathers (flow
fields), or profile evidence that the linear-scan open-set is the bottleneck
on a real-world map (binary heap).

**Rationale for deferral.** None of the deferred features pay for themselves
at rogue-scale (80×60 grids, single-pather-per-turn workloads). A\* with
linear open-set returns in well under a millisecond on these maps.

</details>
### `modules/navmesh` — speculative

**Scope.** Polygon navigation for 2D: walkable polygon regions baked from
authored outlines (or derived from a collision grid), joined by links, with
agent-radius inflation and funnel / string-pulled paths. A 3D sibling
(`modules/navmesh-3d`) ships with the 3D group.

<details>
<summary>Details</summary>

**Not a 3D-only concept.** A navmesh is a walkable *surface*, which makes the
2D case the more direct one — Godot ships an explicit 2D variant
(`NavigationPolygon` + `NavigationRegion2D` + `NavigationAgent2D`, with
one-way/bidirectional `NavigationLink2D` links, `navigation_layers` bitmasks,
and avoidance by agent radius). Unity's `NavMesh` is 3D; the 2D route there is
a community package.

**Trigger.** A 2D game whose obstacles are not grid-aligned, or whose world
is large enough that one polygon replaces many grid cells — Godot's docs make
exactly this argument for mesh-based navigation. `modules/pathfinding`
already covers the grid case, so a navmesh waits for a consumer the grid
cannot serve.

**Why it isn't `modules/pathfinding` V2.** That entry's deferred list is
*grid* A\* work — JPS, flow fields, a binary-heap open set, path smoothing. A
navmesh is a different problem: continuous-space geometry, agent radius, and
region/link composition. Smoothing a grid path and baking an
agent-radius-inflated polygon graph are different jobs.

**Canon.** Godot `NavigationRegion2D` (2D) and `NavigationRegion3D` (3D);
Recast/Detour as the classic 3D bake; Unity `NavMesh`.

**Why speculative rather than deferred.** The *shape* is canon-clear; what is
missing is any consumer representing the class of game that needs it. By this
file's definitions that is `speculative` — the shape exists only if that class
is attempted — which also matches the other zero-consumer entries
(`modules/ui`, `modules/lighting`, `modules/timeline`).

</details>

### `modules/noise` V2 — 3D + extra families — deferred

**Scope.** What V1 left out: **3D samplers** (V1 ships 1D/2D), the **ridged /
ping-pong fractal types** beyond fBm, and the **other algorithm families**
Godot's `FastNoiseLite` and `noise-rs` ship — **cellular / Worley**, **value-
cubic**, and **domain warp** (turbulence).

**Trigger.** 3D: a scoped 3D prototype, following the group rule that
dimension-sensitive work ships as parallel siblings. Everything
else: a consumer that needs it. None of the remainders is *unanimous* canon —
ridged / ping-pong reach 2 of 3 sources (Godot `FRACTAL_RIDGED` /
`FRACTAL_PING_PONG`, `noise-rs` `RidgedMulti` / `Billow`), and cellular /
value-cubic / domain warp are Godot-and-`noise-rs` rather than universal — so
each needs **1** consumer.

<details>
<summary>Details</summary>

**Why V1 stopped where it did.** The three classical algorithm families
(value / Perlin / simplex) in 1D/2D plus the universal fractal combiner (fBm)
are unanimous canon and cleared the rule-book at 0 consumers. Each remainder is
solid canon rather than unanimous, which is the 1-consumer tier — and 3D is
additionally a stack decision, not a capability gap.

**Permanently excluded, not deferred: 1D simplex.** The simplex construction
degenerates in 1D to a gradient noise indistinguishable in shape from
`perlin1D`, so shipping both would be two names for one behaviour.

**Related open item — river-raid's adoption.** `examples/river-raid` hand-sums
three sines for "smooth noise for river width variation"@`examples/river-raid/src/game.ts:137`
and two more for `riverCentreX`@`examples/river-raid/src/game.ts:148`. V1 did
not migrate it because swapping the sine stack for `fbm1D` changes the river's
visual profile — a playtest-owned change, not a mechanical one.

</details>

### `modules/grid-based` V2 — deferred

**Scope.** Additional visibility algorithms and masks not covered by V1:
permissive FOV variants, directional cones, and richer visibility-state
outputs.

<details>
<summary>Details</summary>

**Trigger.** Second consumer needing an algorithm outside V1's shape — for
example stealth cones, faction-shared sight masks, or permissive FOV
tradeoffs.

**Canon.** Unity NavMesh `Raycast`, Godot `RayCast2D` + `VisibleOnScreen`,
broadly: every roguelike framework (libtcod, rot.js) ships FOV as a
first-class primitive separate from pathing.

</details>

### `modules/debug` — deferred

**Scope.** In-game debug overlays — gizmos, entity inspector, frame-time
graphs, system-timing breakdown — dev-build only.

<details>
<summary>Details</summary>

**Probable shape.** Gizmo rendering (show AABBs, show spatial grid, show FOV
cones), a live entity inspector, frame-time / tick-time graphs, system-timing
breakdown. Tree-shaken out of production builds.

**Trigger.** Enough friction debugging existing prototypes that a one-off
`drawDebug` call inside `Canvas2DRenderer` is no longer enough. Platformer's
static-collision overlay already lives in the example — when a second
consumer wants a similar toggle, it promotes.

**Canon.** Unity `Gizmos` / `Debug.DrawRay`, Godot `Debug` tab, `dat.gui` /
`lil-gui` (DOM-based), Tracy / Optick for native engines.

</details>

### `modules/steering` V2 — deferred

**Scope.** The rest of Reynolds' behaviour set not shipped in V1:
**obstacle-avoidance**, **wall-following**, and **path-following**.

<details>
<summary>Details</summary>

**Trigger.** A consumer needing avoidance or path-following. Each promotes on
its own ≥2-consumer rule.

**Also open — an ECS component wrapper** (`SteeringAgentDef` + system). No
consumer wants the component form yet; the pure-function surface is the proven
shape.

**Canon.** Reynolds (1987) steering behaviours; Unity / Unreal / Godot
navigation-avoidance layers.

</details>

### `modules/fsm` V2 — deferred

**Scope.** State-machine features not shipped in V1: **hierarchical / nested
states (HSM)**, **parallel and history states**, and an **`FsmDef`** ECS
component wrapper.

<details>
<summary>Details</summary>

**Trigger.** A consumer whose state graph actually needs nesting or
parallelism — none does yet. Each feature promotes on its own ≥2-consumer
rule.

**Also open — the doom migration.** doom's enemy AI (idle/chase/attack) maps
onto the `update`-returns-next subset and would be a behaviour-preserving
second consumer. Deferred because doom is a complex, playtest-owned 3D example
and the migration is a real `AiDef` schema change (`mode: number` →
`current: string` + `elapsedMs`) — left to a deliberate pass.

**Canon.** Harel statecharts, Unity Animator sub-state machines, Godot
`AnimationNodeStateMachine` nesting.

</details>

### `modules/behavior-tree` V2 — deferred

**Scope.** Decorators not shipped in V1: **`parallel`**, **`cooldown`**, and
**`repeat` / `repeatUntil`**, plus a **stateful** (remembered running-child)
tree variant.

<details>
<summary>Details</summary>

**Trigger.** A consumer needing one of them. The reactive re-tick covered
every critter behaviour in `examples/critters`, so no consumer wants the
stateful variant yet.

**Canon.** Unreal Behavior Tree decorators (`Loop`, `TimeLimit`, `Cooldown`).

</details>

### `modules/goap` V2 — deferred

**Scope.** Planner features not shipped in V1: a **heap open-set**, a shipped
**plan-runner**, and **cost / typed non-boolean facts**.

<details>
<summary>Details</summary>

**Trigger.** Each promotes on its own ≥2-consumer rule. V1 deliberately ships
only the pure `plan()` — execution and replanning stay in the consumer because
mapping `action.name` → a runtime behaviour is game-specific. The linear-scan
open-set is fine at GOAP scale.

**Canon.** F.E.A.R. / Halo GOAP papers; typed-fact planners (SHOP2
preconditions).

</details>

### `modules/particles` V2 — deferred

**Scope.** Advanced particle features deliberately excluded from V1:
**sub-emitters**, **trails**, **particle-collision**, and **sprite-kind**
particles beyond rects.

<details>
<summary>Details</summary>

**Trigger.** A consumer needing one — each promotes on its own ≥2-consumer
rule.

**Canon.** Godot `CPUParticles2D` advanced properties, Unity `ParticleSystem`
sub-emitters + collision module.

</details>

### `modules/ai` — speculative

**Scope.** What's left of the AI-decision family after `modules/steering`
(movement), `modules/fsm`, `modules/behavior-tree`, and `modules/goap` each
shipped as their own modules: **Utility AI** (score each candidate action 0–1,
pick the max) and **HTN** (hierarchical task-network planning).

<details>
<summary>Details</summary>

**Trigger.** Utility AI — a prototype whose choices are *fuzzy trade-offs*
(the Sims-style "how much do I want each option right now") rather than strict
priorities (BT) or discrete states (FSM); it's a small, reusable scorer and the
likely next AI pick. HTN — a prototype needing authored task decomposition
beyond GOAP's emergent search.

**Rationale for speculative.** No current prototype needs either, and neither
has a single canonical API. Utility AI is the lighter, more broadly useful of
the two.

**Canon.** Utility AI: Dave Mark's *Behavioral Mathematics* / "infinite axis"
utility systems, The Sims. HTN: SHOP2, Guerrilla's *Horizon* HTN.

</details>

### `modules/networking` — speculative

**Scope.** Client-authority / server-authority replication, delta compression,
lockstep / rollback — layered on top of `EcsWorld.lifecycle` events and
`modules/save` serialization.

<details>
<summary>Details</summary>

**Trigger.** A scoped multiplayer prototype. None is planned. Local
multi-input belongs under the player-slot helper below, not here —
`modules/networking` is for cross-machine sync.

**Rationale for speculative.** Long-horizon. Network code touches every layer
(input, physics determinism, scene transitions, persistence) and is the wrong
thing to design without a real game shape forcing the constraints.

**Canon.** Bevy `bevy_replicon`, Photon, Mirror (Unity), Source engine
networking model.

</details>

### Local-multiplayer player-slot / input-owner helper — speculative

**Scope.** A small helper for stable local player identity and routing input
to the entity each player controls.

<details>
<summary>Details</summary>

**Trigger.** A second local-multiplayer example beyond local-pong. Two
`createInput`s already work for two players (local-pong, spacewar); only the
slot abstraction is missing. Pong kept player identity as the app-level union
`'left' | 'right'` — correct for that single consumer. Don't design from one
data point — wait for a second.

**Probable shape.** `PlayerSlotDef { slotId: number }` paired with an
`InputOwnerDef { slotId: number }` so a system can route per-slot actions from
`createInput` to the controlled entity. Slot count and mapping stay
app-defined.

**Canon.** Unity `PlayerInput` + `PlayerInputManager`, Unreal local player
index, Godot `InputMap` action sets.

</details>

---

## Gameplay & utility modules — from the examples audit

Promoted from the [engine-gap-ledger](engine-gap-ledger.md) triage pass; the
closed rows of that pass are archived in
[../archived/audits/2026-09-21-example-gap-audit.md](../archived/audits/2026-09-21-example-gap-audit.md).
Each entry is **Deferred** with its consumer tally noted; some have already
cleared their promotion trigger ("MET") and are ready-to-build candidates.
Nothing here is scheduled — promotion records a backlog home and a met bar, it
does not authorise a build.

### `modules/grid-movement` — deferred

**Scope.** Discrete grid/tile movement: step-on-tick, snap-to-cell, occupancy
query, and a 180°-reversal guard. Distinct from `modules/grid-based` (which is
FOV / line-of-sight only, **not** movement).

<details>
<summary>Details</summary>

**Trigger.** A fourth consumer converging on the shape below. The original
"MET (3 consumers)" tally (snake, frogger, rpg — audit B7) did not survive the
dual-cited pass: snake has body-shift + reversal guard + spatial occupancy,
frogger has row-based hopping + water/road semantics, and rpg uses free pixel
movement with walkability checks. Three consumers, three shapes.

**Probable shape.** `GridPositionDef { col, row }` + a step system that
advances by a queued direction on a movement tick, snapping continuous
position to cell centres, with an occupancy lookup and an opposite-direction
reversal guard (snake's classic constraint).

**Canon.** Godot `TileMap` cell coords + grid-snap movement, roguelike grid
step, classic Snake/Sokoban/Pac-Man movement.

</details>

### `modules/rhythm` — speculative

**Scope.** A rhythm-game timing stack: audio-clock `TickSource`, hit-window
judgement, lookahead/absolute-time spawn scheduling, a timestamped input
queue, and latency compensation.

<details>
<summary>Details</summary>

**Trigger.** A second rhythm/timing prototype beyond `examples/rhythm` (audit
B21). Genre-specific but real and cleanly built; one consumer is not enough to
pin a reusable shape.

**Canon.** Friday Night Funkin' engine, osu! timing, Rhythm Doctor
calibration, Web Audio `AudioContext.currentTime` scheduling patterns.

</details>

### App-host mount / teardown helper — speculative

**Scope.** A thin `start(container) => Teardown` contract with a lazy-load
race guard (stale-load token / CAS) for mount → cleanup → async-load →
teardown orchestration.

<details>
<summary>Details</summary>

**Trigger.** A second app-host beyond `examples/hub` (every example
re-implements `start`/teardown). Low priority; the per-example `start`
boilerplate is small.

**Canon.** SPA mount/unmount lifecycles, micro-frontend `mount`/`unmount`
contracts (single-spa), React root `createRoot`/`unmount`.

</details>

### `modules/destructible-terrain` — speculative

**Scope.** Mutable terrain: erase or modify tiles at runtime and keep the
collision mask, the rendered layer, and any path/FOV data in step.

<details>
<summary>Details</summary>

**Trigger.** Ladder entries #18 (Worms), #19 (Dig Dug) and #20 (Motherload)
are all built on it — three consecutive games, none started.

**What ships today is static.** `buildCollisionGrid` derives a
`CollisionGrid { width, height, solid: Uint8Array }` from a `TmxMap` once
(`src/modules/tilemap/collision-grid.ts:10`), and `spawnTilemap` spawns one
entity per non-empty tile from that same map. Neither has a mutation path:
there is no `eraseTile` / `setCell`, and `buildTilemapAtlas` bakes once.

**Probable shape.** The collision half is nearly free — `solid` is already a
row-major `Uint8Array`, so a hole is a write plus a query-cache invalidation.
The rendering half is the real work, and it is the same work
`modules/tilemap` V2 (batched renderable) needs: mutate a tile grid and
re-upload the dirty region instead of respawning entities.

**Rationale for speculative.** It presumes a batched tile layer that does not
exist yet, so it cannot land before V2 — track the two together.

**Canon.** Worms-style destructible bitmaps, Godot `TileMap.erase_cell`,
Unity `Tilemap.SetTile(null)`.

</details>

### `modules/card-interaction` — deferred

**Scope.** Two genre-clustered capabilities for card and deck games:
**zone/pile management** (move a card between hand ↔ deck ↔ discard, or stock
↔ waste, keeping pile metadata consistent) and **drag-and-drop hit-testing**
(reverse hit-test plus a legal-drop predicate).

<details>
<summary>Details</summary>

**Trigger.** Met — 2 consumers each, clustering on one genre shape:
card-battler and solitaire. Compare `modules/grid-movement`, which stayed
`deferred` because three consumers turned out to have three shapes; here two
consumers agree.

**Evidence.** Both ABSENT in `src/`: no zone/pile helper (the tag swaps are
hand-rolled) and no hit-test / drop-predicate helper (card-battler and
solitaire each hand-roll reverse hit-testing for DOM and canvas).

**Open question to settle before building.** card-battler models zones as
*tags*, and tags emit no lifecycle event; a *component* model would get
`ComponentAdded` / `ComponentRemoved` reactivity for free. Pick the zone model
first — it decides both the helper's shape and whether the related ledger row
(zone changes with no reactive hook) closes or returns.

**Canon.** Unity UI drag handlers, Godot `Control` drag-and-drop, Phaser's
drag plugins, every card-game tutorial's hand-rolled pile manager.

</details>

---

## Promotion triggers — summary

Open signals only. When any of the below becomes true, open a plan for the
matching module. Shipped triggers are removed rather than marked done — a
signal's absence from this table means it already produced a module.

| Signal | Unblocks |
|---|---|
| Scrolling prototype needing camera rotation, or a parallax layer model | `modules/camera` V3 |
| Concrete request for `ctx.filter` post-processing | `RenderableDef` extensions V3 (Canvas filters) |
| A second turn-based consumer | `modules/input` event-mode variant |
| 3D prototype scoped | All 3D sibling modules |
| Stacking / ragdoll / vehicle prototype | Rigid-body physics |
| Spatialized playback or shared bus-driven audio events in a second consumer | `modules/audio` V2 |
| Second consumer needing shared named animation clips | `modules/animation` V2 (clip registry) |
| Second app with multiple runtime worlds and full scene stack needs | `modules/scene` V2 |
| Second app needing shared slot metadata/policy conventions | `modules/save` V2 |
| Asset volume exceeds Vite import comfort | `modules/asset-loader` V2 |
| Flow-field / many-pather prototype | `modules/pathfinding` V2 |
| Stealth / line-of-sight prototype needing non-V1 algorithms | `modules/grid-based` V2 |
| Second debug-overlay consumer | `modules/debug` |
| Prototype needing obstacle-avoidance or path-following | `modules/steering` V2 |
| Prototype needing nested / parallel states | `modules/fsm` V2 |
| Prototype needing BT decorators, or a deliberate doom AI migration | `modules/behavior-tree` V2 / the doom migration |
| Prototype needing a GOAP plan-runner or typed facts | `modules/goap` V2 |
| Prototype needing sub-emitters, trails or particle-collision | `modules/particles` V2 |
| Prototype with fuzzy trade-off choices (utility scoring) or authored task decomposition (HTN) | `modules/ai` (Utility AI / HTN) |
| Scoped multiplayer prototype | `modules/networking` |
| Second local-multiplayer example beyond local-pong | Local-multiplayer player-slot helper |
| A prototype whose authored tile grid makes per-cell entities measurably hurt | `modules/tilemap` V2 (batched renderable) |
| Fourth consumer converging on discrete grid movement | `modules/grid-movement` |
| Rhythm/timing prototype beyond `examples/rhythm` | `modules/rhythm` (speculative) |
| Second app-host beyond `examples/hub` | App-host helper (speculative) |
| Prototype needing in-game UI widgets | `modules/ui` |
| Prototype needing branching dialogue (choices, or lines gated on world state) | `modules/dialogue` (speculative) |
| Prototype needing **3D** picking / hitscan / line-of-sight rays | `modules/collision-3d` (3D group) |
| Prototype needing slopes or one-way platforms | `modules/kinematics` V2 |
| Frame-rate-independent physics determinism | `modules/tick` V2 |
| A second radial-gravity consumer | `modules/motion` V2 |
| A game about darkness or light | `modules/lighting` (speculative) |
| A 2D game whose obstacles aren't grid-aligned, or a world too large for a grid | `modules/navmesh` (speculative) |
| A terrain / water prototype wanting ridged, cellular or domain-warp noise | `modules/noise` V2 |
| A prototype with a scripted sequence (intro, cutscene, boss reveal) | `modules/timeline` (speculative) |
| Ladder #18/#19/#20 (Worms, Dig Dug, Motherload) — mutable terrain | `modules/destructible-terrain` (speculative) |
| Card/deck game needing pile moves or drag-and-drop | `modules/card-interaction` |

Every promotion still runs through the engine extension rule-book (the
sliding-scale evidence rule) — this table just catalogs the likely first
signals.
