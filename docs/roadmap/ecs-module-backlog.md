# ECS Module Backlog

**Open module work only.** An entry here is a module (or a slice of one) that
does not exist yet. Nothing here is scheduled — each entry records a *shape*,
the *evidence* that the shape is right, and the **Gate** still standing between
it and a build.

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

### Status: shape, not demand

Status is a claim about the **shape**, and only about the shape. Demand is a
separate axis, recorded separately as the entry's **Gate** (below). Conflating
the two is how a primitive whose shape ships in Unity *and* Godot *and* Bevy
gets filed as "speculative" — which reads as *"we doubt this belongs in a game
engine."* Those are opposite claims.

- **Ready** — the shape is proven: unanimous canon (≥3 major engines shipping
  the *same API shape*) or equivalent internal-consumer evidence. The module
  is **authorized to build**; the only thing left is a build slot. A Ready
  entry is never waiting on evidence — do not write "wait for a second
  consumer" against it.
- **Deferred** — the shape is believable but not yet pinned; a named *shape*
  trigger would prove it. Two cases land here: solid-but-not-unanimous canon
  with no consumer, and a capability whose canon supplies a *function* but not
  a *shape* (physics, networking: every engine ships one, and no two ship the
  same API).
- **Speculative** — the shape is undetermined, or canon is genuinely split
  (ECS-native UI: Bevy does it, Unity and Godot do not). The module exists only
  if a specific class of game is attempted.

Two more statuses exist but are not backlog states, so they live elsewhere:
**Shipped** (the module exists — `src/` + `git log`) and **Declined** /
**Superseded** (terminal — [non-goals.md](non-goals.md)).

Status is read off the [rule-book](../extending-the-engine.md): canon gates
the *shape*, a consumer or the module's own tests gate *integration with this
core*. Canon substitutes for consumers outright — it is not a weaker form of
evidence.

### Gate: shape or scheduling

Every entry's **Gate** states what is actually blocking a build, and it is one
of two kinds:

- **Shape gate** — the API is not pinned; a named trigger would prove it. Only
  `deferred` entries have a shape gate.
- **Scheduling gate** — the shape is proven; what is missing is a build slot,
  a dependency module, or a consumer to exercise it. Every `ready` entry has a
  scheduling gate.

An `ready` entry with a scheduling gate may sit for a long time — that is fine,
because the cost of sitting is zero and the shape is not in doubt.

### Entry shape

Each entry opens with a **Scope** one-liner and carries a **Status** (the
evidence, with the engines named) and a **Gate**. When a sketched API exists
it appears inside the details as **Probable shape**. Canon is cited where it
exists; novel shapes need internal consumers instead.

### Version suffixes (V1 / V2 / …)

When a module ships but parts of its originally-imagined scope are
deliberately left out, the shipped slice becomes **V1** and a sibling **V2**
entry captures what was left. Each further round increments: V3, V4. This
keeps shipped work out of the file while the open remainder stays visible.

**Sweep every V2/V3 before treating it as backlog.** A V2 entry whose only
reason to exist is that "the V1 was built from one consumer's call sites" is
not new work — it is unfinished work, the *slice-V1* failure mode in the
[rule-book](../extending-the-engine.md#failure-mode-3-the-slice-v1). Those
entries are marked **ready** here: the fix is to finish the canon-complete
surface, not to queue a phase two.

**A single missing operation is not a version.** When the leftover is one
named operation rather than a coherent slice, it gets a `<module> — <op>` entry
in [Existing-module gaps](#existing-module-gaps) instead of a version suffix:
`modules/motion` V2 is a slice, `modules/motion` — `moveToward` is one
function.

### Engine extension rule-book

Every entry follows the same sliding-scale rule: a module ships once its
*shape* is proven, where internal consumers and external canon are
interchangeable evidence — unanimous universal canon needs **0** consumers,
solid canon **1**, and a novel/opinionated shape **2** (the genuine rule of
three). A unanimous-canon primitive is **ready**; nothing ships on a guess. See
[extending-the-engine.md](../extending-the-engine.md) for the full rule-book
and guardrails.

---

## Status at a glance

`ready` = shape proven, waiting on a build slot. `deferred` = shape not yet
pinned. `speculative` = shape undetermined or canon split.

| Module | Status | Gate |
|---|---|---|
| `RenderableDef` composite renderables | ready | Scheduling — finish the canon-complete `Renderable` surface |
| `RenderableDef` billboard + Canvas filters | deferred | Shape — a second billboard consumer; a concrete `ctx.filter` request |
| `modules/kinematics` V2 (slopes, one-way) | ready | Scheduling — consumer exercises it |
| `modules/kinematics-3d` V2 (slopes, one-way) | ready | Scheduling — consumer exercises it |
| `modules/motion` V2 (radial force fields) | deferred | Shape — second radial consumer |
| `modules/motion-3d` V2 (attitude, spherical bounds) | deferred | Shape — second consumer for either |
| `modules/camera` V3 (rotation, parallax) | ready | Scheduling — consumer needs it; snake zoom adoption |
| `modules/render-scene3d` | ready | Scheduling — 4 consumers already hand-roll it |
| `modules/camera-3d` | ready | Scheduling — build slot |
| `modules/navmesh-3d` | ready | Scheduling — 3D consumer |
| `modules/render-webgl` / `render-webgpu` | deferred | Shape — three.js covers 3D today |
| Rigid-body physics | deferred | Shape — no single canon API; demand + backend choice |
| `modules/audio` V2 spatial listener | ready | Scheduling — build slot |
| `modules/audio` V2 event adapters, clip loading | deferred | Shape — a second consumer's convention |
| `modules/animation` V2 clip registry | ready | Scheduling — build slot |
| `modules/animation` V2 rig, `TweenDef` component | deferred | Shape — 2D rig canon thin; no component consumer |
| `modules/ui` | speculative | Shape — ECS-vs-scene-graph UI is a split decision |
| `modules/dialogue` | speculative | Shape — choices/world-gating unproven by a linear consumer |
| `modules/render-dom` V2 | deferred | Shape — second DOM-heavy consumer |
| `modules/render-target` | ready | Scheduling — build slot (3D render family) |
| `modules/lighting` | ready | Scheduling — consumer that is about light |
| `modules/scene` V2 | ready | Scheduling — build slot |
| `modules/timeline` | ready | Scheduling — consumer with a scripted sequence |
| `modules/save` V2 | deferred | Shape — a shared slot-policy convention |
| `modules/asset-loader` V2 | deferred | Shape — second consumer of grouped manifests |
| `modules/tilemap` V2 (batched renderable) | ready | Scheduling — a large authored grid |
| `modules/pathfinding` V2 | deferred | Shape — per-algorithm triggers |
| `modules/navmesh` (2D) | deferred | Shape — a 2D consumer the grid cannot serve |
| `modules/noise` V3 (extra fractal types, families) | deferred | Shape — a consumer needing them |
| `modules/grid-based` V2 | deferred | Shape — second consumer needing another algorithm |
| `modules/debug` | ready | Scheduling — build slot (dev-only) |
| `modules/steering` V2 | ready | Scheduling — build slot |
| `modules/fsm` V2 | ready | Scheduling — build slot |
| `modules/behavior-tree` V2 | deferred | Shape — a consumer needing the decorators |
| `modules/goap` V2 | deferred | Shape — a consumer needing planner features |
| `modules/particles` V2 | ready | Scheduling — build slot |
| `modules/ai` (Utility AI / HTN) | speculative | Shape — no single canonical API |
| `modules/networking` | speculative | Shape — replication shape follows a real game |
| Local-multiplayer player-slot helper | deferred | Shape — second local-multiplayer example |
| `modules/grid-movement` | deferred | Shape — a fourth consumer converging on one shape |
| `modules/rhythm` | speculative | Shape — second rhythm prototype |
| App-host mount / teardown helper | speculative | Shape — second app host |
| `modules/destructible-terrain` | ready | Scheduling — depends on `modules/tilemap` V2 |
| `modules/card-interaction` | ready | Scheduling — build slot |
| `modules/input` — wheel + multi-touch | deferred | Shape — wheel model and multi-pointer set unpinned |
| `modules/spatial` — `QuadTree` / `BVH` backends | deferred | Shape — one consumer a uniform grid cannot serve |

---

## 2D module extensions

### `RenderableDef` composite renderables — ready

**Scope.** One entity drawing several primitives, so `Renderable` stops being
one drawable per entity.

**Status.** Ready — multiple drawables per object is the same shape in Unity
(several `Renderer` components), Godot (several `CanvasItem` children) and
Phaser (`Container`). One internal consumer today.

**Gate.** Scheduling — folded into finishing the canon-complete `Renderable`
surface.

<details>
<summary>Details</summary>

`Renderable`@`src/modules/render-canvas2d/renderable.ts` is a single
discriminated union — one `kind` per entity — so multi-part sprites
(flappy's pipe pairs) are hand-drawn instead of going through the renderer.
1 consumer. The canon-complete fix is a drawable *list* per entity, not a
bigger union.

</details>

### `RenderableDef` billboard sprite + Canvas filters — deferred

**Scope.** A camera-facing textured quad for a 2D sprite in a 3D world, and
`ctx.filter` post-processing (blur, drop-shadow and similar).

**Status.** Deferred. Billboard: doom is the only consumer and three.js
`Sprite` covers it. Canvas filters: no canon pressure — the effects are rarely
used in practice.

**Gate.** Shape — a second billboard consumer; a concrete request for
`ctx.filter` post-processing.

<details>
<summary>Details</summary>

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

### `modules/kinematics` V2 — slopes + one-way platforms — ready

**Scope.** Two surface behaviours the arcade body solver lacks: **slopes**
(walk a non-axis-aligned surface with the body following its normal) and
**one-way platforms** (solid from above, pass-through from below).

**Status.** Ready — the same shape in Unity (`PlatformEffector2D`), Godot
(`CharacterBody2D` one-way collision) and GameMaker, and the standard in every
Celeste-lineage platformer. This is the *slice-V1* case: the shape was known
when V1 shipped.

**Gate.** Scheduling — a platformer consumer that exercises it.

<details>
<summary>Details</summary>

**Evidence.** ABSENT, confirmed in `src/`: a grep of `src/modules/**` finds no
`oneWay` or slope handling in `collision` or `kinematics`; the only `slope`
matches are shadowcasting math in `grid-based/visibility.ts:45`.

**Probable shape.** One-way is a per-collider flag consulted in the axis
sweep (skip the contact when the mover approaches from the disabled side).
Slopes need the sweep to become normal-aware, or an explicit slope resolver
after it. `kinematics-3d` ships without either; they are its own entry below.

Ladder entries #15/#16/#17 (Mario Bros, Pitfall, VVVVVV) all need them, and
[engine-readiness-assessment.md](../engine-readiness-assessment.md) names
both as Hollow Knight's load-bearing blocker.

</details>

### `modules/kinematics-3d` V2 — slopes + one-way platforms — ready

**Scope.** The 3D siblings of the two surface behaviours the
`modules/kinematics` V2 entry carries: walking a non-axis-aligned surface with
the body following its normal, and platforms solid from above but
pass-through from below.

**Status.** Ready — Godot ships `CharacterBody3D.floor_max_angle` and
`CollisionShape3D.one_way_collision`, Unity `CharacterController.slopeLimit`,
Unreal a walkable-floor angle. Same shape in three engines.

**Gate.** Scheduling — a 3D platformer consumer that exercises it.

<details>
<summary>Details</summary>

**Probable shape.** Same in kind as the 2D shape: one-way is a per-collider
flag consulted in the axis sweep, slopes need the sweep to become
normal-aware, or an explicit slope resolver after it. Shipping
`modules/kinematics-3d` without them was not a deliberate scope call against
canon — it is the same slice-V1 gap as the 2D half.

</details>

### `modules/motion` V2 — force fields (point attractor) — deferred

**Scope.** A reusable "accelerate every body toward point P" force — the
radial/attractor case, as distinct from constant-directional gravity.

**Status.** Deferred — canon here is *game-side*, not a shared engine shape.
Constant-directional gravity ships in every integrator; radial fields are
normally a game-side force accumulator (Unity `Rigidbody.AddForce` with a
computed direction, Godot `Area2D` gravity point). Function is canon; shape is
not.

**Gate.** Shape — a second *radial* consumer.

<details>
<summary>Details</summary>

spacewar is the only consumer: it hand-rolls an inverse-square field toward
the star with a minimum-radius clamp (`force = STAR_GRAVITY / r2`@`examples/spacewar/src/systems/gravity.ts:52`,
clamp @:49). flappy / jetpack / platformer-3d hand-roll constant
`vel.vy += G*dt`, which is a one-liner and **not** the same shape.

**Related row closed with this entry.** The ledger's out-of-bounds respawn
(kill-plane) row is declined, not promoted — portal and doom each check
`y < RESPAWN_Y` in `onBeforeFlush`, which is a one-liner, not a force. See
[non-goals.md](non-goals.md).

</details>

### `modules/motion-3d` V2 — attitude control + non-box bounds — deferred

**Scope.** Two shapes V1 deliberately left out: **free-flight attitude control**
(rate-steered quaternion orientation + a throttle scalar driving velocity along
the facing vector) and **non-box world bounds** (a spherical clamp / bounce, as
distinct from V1's axis-aligned `Bounds3D`).

**Status.** Deferred — neither is an engine-canon *motion primitive*. Unity /
Godot / Unreal ship velocity integration and playfield bounds, but a
"free-flight controller" and a "spherical arena bound" are game-specific
things each title builds.

**Gate.** Shape — a second consumer for either.

<details>
<summary>Details</summary>

`examples/starfighter` is the only consumer for both: it steers
`orientation: Quat` by an angular-rate vector eased toward an input target and
integrates it with `quatFromAxisAngle`/`quatMul`
(`examples/starfighter/src/systems/ship.ts`), and clamps/bounces bodies against
a sphere (`ship.ts` `shipBoundsSystem`, `target.ts`). Both are stored in
GameState, not components, and are a single-consumer opinionated shape.

**Why not V1.** Velocity integration (V1) is the unanimous-canon part; these
wait for a second consumer to prove the shape.

**Canon.** Free-flight attitude: Elite / No Man's Sky flight models (game-side).
Spherical bounds: game-specific; the canonical engine bound is a box (shipped).

</details>

### `modules/camera` V3 — rotation + parallax layers — ready

**Scope.** Two things V2 deliberately left out of the canon-complete 2D
camera: **rotation** (Godot `Camera2D.rotation`) and **parallax layers** (a
layer / scroll-factor model).

**Status.** Ready — rotation is a camera transform in Godot
(`Camera2D.rotation`), Phaser (`Camera.rotation`) and Unity (a 2D camera is a
3D camera, so rotation is native), and per-layer scroll-factor parallax is
the same shape in all three.

**Gate.** Scheduling — a scrolling prototype that needs either.

<details>
<summary>Details</summary>

**Rotation.** A rotated view needs a full affine transform plus a
*conservative* rotated-AABB cull — the shipped cull is axis-aligned. 2D
top-down and platform games rarely rotate the camera, but the omission is a
slice-V1 gap, not a decision against canon.

**Parallax.** Its own follow-up shape rather than a camera flag: a layer list
with per-layer scroll factors, which the renderer would consume alongside
`view`.

**Related open item — snake's `CameraDef` adoption.** The V2 `view`/zoom hook
exists; snake still bakes the `cells → pixels` scale into every renderable by
hand instead of adopting a camera zoom.

**Pixel/tile helpers** stay in app code (DOM/canvas-specific) — deliberate,
but not deferred work.

</details>

---

## 3D siblings

**Scope.** Parallel 3D-dimension modules (transform, motion, collision,
kinematics, render, camera-3d, navmesh-3d) that ship alongside the 2D stack
rather than replacing it.

**Rules (re-affirmed).**

- Do not add `z` to `PositionDef`. Breaks `HashGrid2D`, every query, and the
  2D contract.
- Do not preemptively rename `PositionDef` → `Position2DDef`. Retroactive
  rename only if mixed 2D/3D games prove it ambiguous.
- `SpatialStructure<TPos>` is already generic in core — a future `HashGrid3D`
  ships as another backend with zero core change. That is why spatial is
  dimension-agnostic and is not duplicated below.

### `modules/render-scene3d` — ready

**Scope.** Entity ↔ scene-object sync: create / update / reap by tag — the 3D
analogue of `Canvas2DRenderer`.

**Status.** Ready — the same shape in three.js scene graphs and Babylon
`Scene`, **and** the largest de-facto demand cluster in this file: **4
consumers** hand-roll the three.js entity↔mesh sync (platformer-3d, portal,
doom, starfighter). Both axes are met.

**Gate.** Scheduling — build slot.

<details>
<summary>Details</summary>

Shipped alongside it: `modules/collision-3d`, `modules/kinematics-3d`,
`modules/transform-3d` and `modules/motion-3d` — each replaced a hand-rolled
duplicate. The `Vec3` / `Quat` value blocks they share are not 3D-only, so they
live with the scalar helpers in `modules/math`. This is the remaining one the
fourth consumer has not yet pulled in.

</details>

### `modules/camera-3d` — ready

**Scope.** Projection (perspective + ortho), frustum, view matrix, and the rig
family — first-person look, orbit, third-person chase (smoothed, slerped).

**Status.** Ready — Bevy `Camera3dBundle`, Unity `Camera`, Godot `Camera3D`
ship the same primitives.

**Gate.** Scheduling — build slot.

### `modules/navmesh-3d` — ready

**Scope.** Triangle-mesh navigation: bake, regions, links, agent-radius
inflation. 2D sibling: `modules/navmesh`.

**Status.** Ready — Recast/Detour, Godot `NavigationRegion3D` and Unity
`NavMesh` ship the same bake → regions → links → agent-radius shape.

**Gate.** Scheduling — a 3D consumer.

### `modules/render-webgl` / `modules/render-webgpu` — deferred

**Scope.** `Renderer<TCtx>` implementations backed by WebGL / WebGPU.

**Status.** Deferred — the capability is canon (three.js, Babylon), but the
3D examples already render through three.js, so the engine has a primitive
covering the need. Per the rule-book's own signal — *the engine already has a
primitive that covers 80% of the need* — this is not a gap yet.

**Gate.** Shape — a consumer wanting the engine's `Renderer` interface for 3D
rather than three.js directly.

---

## Rigid-body physics — deferred

**Scope.** Full rigid-body simulation (mass, restitution, constraints,
continuous collision across many dynamic bodies) distinct from the shipped
arcade `modules/kinematics`.

**Status.** Deferred — physics is canon as a *capability* (Unity PhysX, Godot,
Unreal Chaos, Box2D, Rapier) but **not as a shape**: no two engines ship the
same API, and the sketch below deliberately leaves roll-our-own vs adapt
open. Canon supplies a function, not a shape.

**Gate.** Shape — a prototype that arcade physics genuinely cannot handle,
plus a backend choice.

<details>
<summary>Details</summary>

**Probable shape.** Either roll our own (AABB-only, minimal) or adapt
`planck.js` / `rapier-js`. Integrates with `SpatialStructure` via a
physics-appropriate backend (BVH / SweepAndPrune).

**Trigger.** Stacking crates with realistic settle, rope / chain, jointed
ragdoll, soft-body, vehicles with suspension.

**Rationale for the caution.** Arcade covers platformers, top-down action,
twin-stick shooters, and puzzle-physics-lite. Full physics is a large ongoing
commitment (authoring tools, debug viz, determinism tuning) and should not be
spent without a game design that demands it.

</details>

---

## Standard engine modules

### `modules/audio` V2 — spatial listener — ready

**Scope.** Listener-aware playback: a listener position/orientation on the
world and distance/pan attenuation on each source.

**Status.** Ready — the same shape in Unity (`AudioSource` /
`AudioListener`), Godot `AudioStream*`, Phaser `SoundManager` and Bevy
`bevy_audio`.

**Gate.** Scheduling — build slot.

### `modules/audio` V2 — event adapters, clip loading — deferred

**Scope.** Bus-driven one-shot event adapters, and clip loading orchestration
with `modules/asset-loader`.

**Status.** Deferred — these are *conventions* over a shipped module rather
than a primitive, and each engine's wiring differs.

**Gate.** Shape — a second consumer sharing the same event wiring or
clip-binding flow.

### `modules/animation` V2 — clip registry — ready

**Scope.** A clip registry: named animation clips shared across entities,
lookup by key, playback control.

**Status.** Ready — the same shape in Unity (`AnimationClip`), Godot
(`Animation`), Bevy (`AnimationClip`) and Phaser (named anims): a named clip
resource shared across entities and selected by key. V1 ships the per-entity
`SpriteAnimationDef` only, which is a slice of the canonical surface.

**Gate.** Scheduling — build slot.

### `modules/animation` V2 — 2D rig, `TweenDef` component — deferred

**Scope.** Skeletal / 2D-rig animation, and an ECS component wrapper for
tweens.

**Status.** Deferred — 2D rig canon is thinner (Godot `Skeleton2D`, Unity's
separate 2D Animation package) and needs a consumer; the `TweenDef` component
shape isn't single-canon (Godot node vs a DOTween fluent chain).

**Gate.** Shape — a consumer requesting a rig; a consumer wanting the
component form of a tween.

### `modules/ui` — speculative

**Scope.** Game-facing UI as ECS — in-world HUDs, damage numbers, inventory
widgets — distinct from `modules/render-canvas2d` and from app-layer DOM UI.

**Status.** Speculative — canon is **split**: Bevy does ECS-native UI
(`bevy_ui`, flecs UI addons) and Unity UGUI / Godot `Control` keep UI on a
dedicated scene graph. Picking a side speculatively is waste.

**Gate.** Shape — a second prototype that needs in-game UI widgets, enough to
commit to a model.

<details>
<summary>Details</summary>

Today the roguelike's UI is DOM + app code; snake/asteroids/platformer use the
canvas directly. The capability assessment ranks UI as the **most frequently
missing surface** across the five commercial-scale targets, which is why it is
worth watching — but "most often missing" is not the same as "canon has a
shape".

</details>

### `modules/dialogue` — speculative

**Scope.** The presenter + runner **seam** only: a `DialogueRunner` contract
(`advance()` → next step, `choose(index)`) and a `DialoguePresenter`
interface (show a line, show choices, close). **No narrative language, no
script format, no VM** — those stay app-side.

**Status.** Speculative — **one verified runtime plus one authoring-pipeline
precedent**, short of the ≥3-engine unanimity the rule-book needs to promote
on canon alone, and the step model is opinionated besides.

**Gate.** Shape — a narrative prototype needing *branching* dialogue (choices,
or lines gated on world state).

<details>
<summary>Details</summary>

`examples/rpg` is the only consumer and it is strictly linear: a flat per-NPC
line array
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
runtime API was not opened in this pass.

**Not `modules/ui`.** That entry is in-world ECS widgets; this one is
app-layer presentation plus a runner contract.

</details>

### `modules/render-dom` V2 — deferred

**Scope.** Follow-ups intentionally excluded from V1: event-driven DOM updates
via lifecycle hooks and higher-level zone/container reparenting helpers.

**Status.** Deferred — these are workflow layers over a shipped module, not a
missing primitive; each engine's reconciler shape differs.

**Gate.** Shape — a second DOM-heavy consumer proving a shared shape.

### `modules/render-target` — ready

**Scope.** A render-to-texture primitive: a secondary camera renders the scene
(or a layer of it) into an offscreen target, which is then sampled as a texture
on an in-world surface. The substrate behind portals, planar mirrors,
security-camera monitors, in-world screens/TVs, and minimaps.

**Status.** Ready — **unanimous** canon, the same shape in Unity (`Camera` →
`RenderTexture`), Godot (`SubViewport` + `Camera3D` → `ViewportTexture`),
Unreal (`SceneCaptureComponent2D` → render target) and three.js
(`WebGLRenderTarget`). Clears the zero-consumer bar on its own; portal is a
bonus consumer.

**Gate.** Scheduling — build slot, alongside the 3D render-module family.

<details>
<summary>Details</summary>

**Evidence.** `examples/portal` hand-rolls the whole thing inside its renderer:
a `virtualCam` posed per portal (`render.ts:244`), one `WebGLRenderTarget` per
view rendered by `renderToTarget()` (`render.ts:646`,
`renderer.setRenderTarget(rt); renderer.render(scene, virtualCam)`), and a quad
shader that samples the target as its surface (`render.ts:96`). ABSENT in
`src/modules/**` — no render-target or secondary-camera helper exists.

**Probable shape.** A `RenderTarget` handle (size, dpr, linear/sRGB) plus a
`renderView(target, camera, { clipPlanes? })` call that a consumer drives each
frame, returning the texture to bind onto a material. Deliberately *does not*
own the portal specifics.

**Explicitly out of scope (stays in the portal example, 1 consumer).** The
portal *transform* (`portalTransform` / `transformPoint`), the oblique
near-plane clip to the destination wall (`render.ts:652`), and the fixed
2-level recursion. These are an opinionated, single-consumer shape — they
promote only when a second consumer (a mirror, a monitor, a second portal-like
game) converges on them.

</details>

### `modules/lighting` — ready

**Scope.** 2D lighting: light sources with radius/cone/falloff, occluders
that cast shadows, and a light-accumulation pass the renderer blends over
the world.

**Status.** Ready — the same shape in Godot (`Light2D` + `LightOccluder2D`),
Unity 2D Lights (URP) and Phaser's `Light2D` pipeline. Zero consumers today,
which is the case the rule-book explicitly covers: canon alone authorizes it.

**Gate.** Scheduling — a game that is *about* darkness or light (stealth
visibility, cave crawling, day/night mood).

<details>
<summary>Details</summary>

**Evidence.** ABSENT in `src/`: a grep for `Light2D`/lighting finds only
`castLight` shadowcasting in `grid-based/visibility.ts:88`. The Canvas2D
renderer has no blend-mode lighting pass. That is a missing canon primitive,
not a reason to wait — `modules/grid-based` visibility is the related but
different capability (what the *player* can see on a grid, not what the
*renderer* lights).

**The light model is not an open question.** Canon-complete means shipping
Godot's `Light2D` surface (texture, energy, colour, shadow on/off, occluder
polygons), not guessing a model from scratch.

[engine-readiness-assessment.md](../engine-readiness-assessment.md) names it
for Hollow Knight ("Lighting, shaders, post-FX — Canvas2D only").

</details>

### `modules/scene` V2 — ready

**Scope.** Full scene-stack orchestration: bundle-a-world-with-content, scene
push/pop, pause/modal layers, and optional transition effects.

**Status.** Ready — the same shape in Unity `SceneManager`, Godot scenes and
Bevy `States`. V1 ships only the tick-boundary transition queue
(`SceneTransitionQueue`) plus `transferEntities`, which is the slice.

**Gate.** Scheduling — build slot.

### `modules/timeline` — ready

**Scope.** Sequenced multi-track playback — "do A, wait 0.5 s, then B and C
together" — where the tracks drive tweens, camera moves, dialogue steps, and
app callbacks off one clock.

**Status.** Ready — the same shape in Unity Timeline, Godot
`AnimationPlayer` + `AnimationTree` and Unreal Sequencer. No consumer yet,
which is the zero-canon-consumer case the rule-book covers.

**Gate.** Scheduling — a prototype with a scripted sequence.

<details>
<summary>Details</summary>

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

</details>

### `modules/save` V2 — deferred

**Scope.** Higher-level save orchestration not in V1: shared slot-policy
conventions, cross-game metadata schemas, and optional app-payload composition
helpers layered above world serialization.

**Status.** Deferred — canon is a *function* without a shape: Unity ships
`JsonUtility` and expects a custom save system, Godot `ResourceSaver`, Bevy a
community crate. No two engines agree on slot policy or metadata schema.

**Gate.** Shape — a second consumer needing a shared slot-policy or metadata
convention.

### `modules/asset-loader` V2 — deferred

**Scope.** Higher-level workflows intentionally excluded from V1: manifest
grouping, weighted per-byte progress, and optional dev-time hot reload hooks.

**Status.** Deferred — a workflow layer over a shipped loader; manifest and
progress APIs differ substantially between Unity `Addressables`, Godot
`ResourceLoader`, Phaser `LoaderPlugin` and Bevy `AssetServer`.

**Gate.** Shape — a second consumer needing grouped manifests or byte-level
progress semantics.

### `modules/tilemap` V2 — batched renderable — ready

**Scope.** `TilemapDef { widthTiles, heightTiles, tileW, tileH, data }` plus a
matching renderer pass, so a whole layer draws in one batched pass instead of
one entity per cell.

**Status.** Ready — the same shape in Unity `Tilemap`, Godot `TileMap` and
Phaser `Tilemap`. V1 spawns a sprite entity per non-empty tile, which is
correct but not the canonical surface.

**Gate.** Scheduling — a prototype whose authored tile grid is large enough
that per-cell entities measurably hurt.

<details>
<summary>Details</summary>

**Rationale.** V1 is proven correct at ~10k entities (`examples/tilemap`) but
wasteful in entity count, query cost, and draw calls. `examples/tilemap`
already bakes its static ~10k-tile map to one offscreen bitmap — the
consumer-side workaround this module would replace. Current platformer uses
procedurally-placed AABB platforms, so it does not qualify yet.

**Distinct from** the roguelike's `GameMap` (app-layer, narrative-tile) and
from `modules/spatial` (which indexes entities, not tiles).

**Canon.** Unity `Tilemap`, Godot `TileMap`, Phaser `Tilemap`, with Tiled as
the external authoring tool (`modules/tmx` already parses it).

**Related.** `modules/destructible-terrain` needs this module's dirty-region
re-upload path — the two are tracked together.

</details>

### `modules/pathfinding` V2 — deferred

**Scope.** Additional algorithms (JPS, flow fields, bidirectional, D\* Lite)
and A\* optimizations (path smoothing, binary-heap open-set) that V1
intentionally omits.

**Status.** Deferred — each is a distinct algorithm with its own niche, and
none is an engine-canon *shape* (engines ship A\* and leave the variants to
libraries). None pays for itself at rogue-scale (80×60 grids,
single-pather-per-turn workloads).

**Gate.** Shape — each sub-feature's own ≥2-consumer rule. Likely first
movers: a strategy prototype with many simultaneous pathers (flow fields), or
profile evidence that the linear-scan open-set is the bottleneck (binary
heap).

### `modules/navmesh` — deferred

**Scope.** Polygon navigation for 2D: walkable polygon regions baked from
authored outlines (or derived from a collision grid), joined by links, with
agent-radius inflation and funnel / string-pulled paths.

**Status.** Deferred — solid canon but not unanimous for *2D*: Godot ships an
explicit 2D variant (`NavigationPolygon` + `NavigationRegion2D` +
`NavigationAgent2D`, with `NavigationLink2D` links, `navigation_layers`
bitmasks, avoidance by agent radius), while Unity's `NavMesh` is 3D and the
2D route there is a community package. Godot's docs make the mesh-beats-grid
argument itself. Solid canon with no consumer for that class of game ⇒
deferred, not speculative.

**Gate.** Shape — a 2D game whose obstacles are not grid-aligned, or whose
world is large enough that one polygon replaces many grid cells.

<details>
<summary>Details</summary>

**Not a 3D-only concept.** A navmesh is a walkable *surface*, which makes the
2D case the more direct one. `modules/pathfinding` already covers the grid
case, so a navmesh waits for a consumer the grid cannot serve.

**Why it isn't `modules/pathfinding` V2.** That entry's deferred list is
*grid* A\* work — JPS, flow fields, a binary-heap open set, path smoothing. A
navmesh is a different problem: continuous-space geometry, agent radius, and
region/link composition. Smoothing a grid path and baking an
agent-radius-inflated polygon graph are different jobs.

**Related.** The 3D sibling, `modules/navmesh-3d`, is **ready** — Recast/Detour,
Godot `NavigationRegion3D` and Unity `NavMesh` agree on the shape there.

</details>

### `modules/noise` V3 — extra fractal types + algorithm families — deferred

**Scope.** The **ridged / ping-pong fractal types** beyond fBm, and the other
algorithm families Godot's `FastNoiseLite` and `noise-rs` ship — **cellular /
Worley**, **value-cubic**, and **domain warp** (turbulence).

**Status.** Deferred — none is *unanimous* canon. Ridged / ping-pong reach 2
of 3 sources (Godot `FRACTAL_RIDGED` / `FRACTAL_PING_PONG`, `noise-rs`
`RidgedMulti` / `Billow`), and cellular / value-cubic / domain warp are
Godot-and-`noise-rs` rather than universal.

**Gate.** Shape — a consumer that needs one, at the rule-book's solid-canon
tier of 1.

<details>
<summary>Details</summary>

**Permanently excluded, not deferred: 1D simplex.** The simplex construction
degenerates in 1D to a gradient noise indistinguishable in shape from
`perlin1D`, so shipping both would be two names for one behaviour.

**Related open item — river-raid's adoption.** `examples/river-raid`
hand-sums three sines for "smooth noise for river width
variation"@`examples/river-raid/src/game.ts:137` and two more for
`riverCentreX`@`examples/river-raid/src/game.ts:148`. V1 did not migrate it
because swapping the sine stack for `fbm1D` changes the river's visual
profile — a playtest-owned change, not a mechanical one.

</details>

### `modules/grid-based` V2 — deferred

**Scope.** Additional visibility algorithms and masks not covered by V1:
permissive FOV variants, directional cones, and richer visibility-state
outputs.

**Status.** Deferred — every roguelike framework (libtcod, rot.js) ships FOV
variants and Unity/Godot supply raycast cones, but the *set* to ship is a
function of the game's needs, not a single canonical shape.

**Gate.** Shape — a second consumer needing an algorithm outside V1's shape
(stealth cones, faction-shared sight masks, permissive-FOV tradeoffs).

### `modules/debug` — ready

**Scope.** In-game debug overlays — gizmos, entity inspector, frame-time
graphs, system-timing breakdown — dev-build only.

**Status.** Ready — the same shape in Unity (`Gizmos` / `Debug.DrawRay` +
Inspector), Godot's Debug tab, and Unreal's `DrawDebugHelpers` + console.
Tree-shaken out of production builds; also overlaps
[core-engine-roadmap.md](core-engine-roadmap.md) §4.2, which asks whether the
entity inspector is core or belongs to this module.

**Gate.** Scheduling — build slot.

<details>
<summary>Details</summary>

**Probable shape.** Gizmo rendering (show AABBs, show spatial grid, show FOV
cones), a live entity inspector, frame-time / tick-time graphs, system-timing
breakdown. Platformer's static-collision overlay already lives in the example;
when a second consumer wants a similar toggle, migrate it here.

**Non-goals boundary.** `non-goals.md` declines a *visual editor / inspector as
authoring tool*. This module is diagnose-only, which is why it is not the same
decision.

</details>

### `modules/steering` V2 — ready

**Scope.** The rest of Reynolds' behaviour set not shipped in V1:
**obstacle-avoidance**, **wall-following**, and **path-following**.

**Status.** Ready — obstacle avoidance is the same shape in Unity
`NavMeshAgent` avoidance, Unreal's avoidance layer and Godot's RVO
(`NavigationAgent2D.avoidance_enabled`); path-following is the same shape in
Unity `NavMeshAgent.SetDestination`, Unreal `MoveTo` and Godot
`NavigationAgent2D.target_position`. Both sit on top of the Reynolds
behaviour set V1 already implements. Wall-following has no engine-level
counterpart (it is a robotics-era behaviour), so it rides along as the
Reynolds-set remainder.

**Gate.** Scheduling — build slot.

<details>
<summary>Details</summary>

**Also open — an ECS component wrapper** (`SteeringAgentDef` + system) stays
deferred: no consumer wants the component form yet; the pure-function surface
is the proven shape.

</details>

### `modules/fsm` V2 — ready

**Scope.** State-machine features not shipped in V1: **hierarchical / nested
states (HSM)**, **parallel and history states**, and an **`FsmDef`** ECS
component wrapper.

**Status.** Ready for the HSM surface — nested states and history are the same
shape in Unity Animator sub-state machines, Godot's
`AnimationNodeStateMachine` nesting and Unreal's State Machine nodes, on top
of the Harel statechart formalism. The `FsmDef` component wrapper stays
deferred (no consumer wants it yet).

**Gate.** Scheduling — build slot; the doom AI migration below.

<details>
<summary>Details</summary>

**Also open — the doom migration.** doom's enemy AI (idle/chase/attack) maps
onto the `update`-returns-next subset and would be a behaviour-preserving
second consumer. Deferred because doom is a complex, playtest-owned 3D example
and the migration is a real `AiDef` schema change (`mode: number` →
`current: string` + `elapsedMs`) — left to a deliberate pass.

</details>

### `modules/behavior-tree` V2 — deferred

**Scope.** Decorators not shipped in V1: **`parallel`**, **`cooldown`**, and
**`repeat` / `repeatUntil`**, plus a **stateful** (remembered running-child)
tree variant.

**Status.** Deferred — solid but not unanimous canon (Unreal's `Loop` /
`TimeLimit` / `Cooldown` decorators are the reference shape; Godot has no
built-in behaviour tree).

**Gate.** Shape — a consumer needing one of them. The reactive re-tick covered
every critter behaviour in `examples/critters`, so no consumer wants the
stateful variant yet.

### `modules/goap` V2 — deferred

**Scope.** Planner features not shipped in V1: a **heap open-set**, a shipped
**plan-runner**, and **cost / typed non-boolean facts**.

**Status.** Deferred — canon here is papers (F.E.A.R. / Halo GOAP, SHOP2), not
a shipped engine API; each feature is a distinct shape.

**Gate.** Shape — a consumer needing one, at its own ≥2-consumer rule. V1
deliberately ships only the pure `plan()` — execution and replanning stay in
the consumer because mapping `action.name` → a runtime behaviour is
game-specific. The linear-scan open-set is fine at GOAP scale.

### `modules/particles` V2 — ready

**Scope.** Advanced particle features deliberately excluded from V1:
**sub-emitters**, **trails**, **particle-collision**, and **sprite-kind**
particles beyond rects.

**Status.** Ready — the same shape in Unity's `ParticleSystem` modules,
Godot's `CPUParticles2D` / `GPUParticles2D` advanced properties, and Unreal's
Niagara/Cascade modules. V1's rect-only emitter is the slice.

**Gate.** Scheduling — build slot.

### `modules/ai` — speculative

**Scope.** What's left of the AI-decision family after `modules/steering`
(movement), `modules/fsm`, `modules/behavior-tree`, and `modules/goap` each
shipped as their own modules: **Utility AI** (score each candidate action 0–1,
pick the max) and **HTN** (hierarchical task-network planning).

**Status.** Speculative — **neither has a single canonical API**. Utility AI
lives in papers and hand-rolled scorers (Dave Mark's *Behavioral Mathematics*
/ "infinite axis" utility systems, The Sims); HTN in SHOP2 and Guerrilla's
*Horizon*, not in shipped engine surfaces.

**Gate.** Shape — a prototype needing fuzzy trade-off choices (Utility AI, the
lighter and more broadly useful of the two) or authored task decomposition
(HTN).

### `modules/networking` — speculative

**Scope.** Client-authority / server-authority replication, delta compression,
lockstep / rollback — layered on top of `EcsWorld.lifecycle` events and
`modules/save` serialization.

**Status.** Speculative — canon is a *capability* with wildly divergent shapes
(Photon, Mirror, bevy_replicon, Unity Netcode, Source's model). Network code
touches every layer (input, physics determinism, scene transitions,
persistence), so the shape has to be forced by a real game's constraints.

**Gate.** Shape — a scoped multiplayer prototype. None is planned. Local
multi-input belongs under the player-slot helper below, not here —
`modules/networking` is for cross-machine sync.

### Local-multiplayer player-slot / input-owner helper — deferred

**Scope.** A small helper for stable local player identity and routing input
to the entity each player controls.

**Status.** Deferred — Unity's `PlayerInput` + `PlayerInputManager` and
Unreal's local-player index are the canon shape, but the ECS-side split (two
component defs) is opinionated and one-example shapes over-fit. The two
existing consumers (local-pong, spacewar) both kept player identity as
app-level unions rather than converging on a slot abstraction.

**Gate.** Shape — a second local-multiplayer example converging on it. Pong
kept player identity as the app-level union `'left' | 'right'` — correct for
that single consumer.

<details>
<summary>Details</summary>

**Probable shape.** `PlayerSlotDef { slotId: number }` paired with an
`InputOwnerDef { slotId: number }` so a system can route per-slot actions from
`createInput` to the controlled entity. Slot count and mapping stay
app-defined.

</details>

---

## Gameplay & utility modules — from the examples audit

Promoted from the [engine-gap-ledger](engine-gap-ledger.md) triage pass; the
closed rows of that pass are archived in
[../archived/audits/2026-09-21-example-gap-audit.md](../archived/audits/2026-09-21-example-gap-audit.md).
Each entry carries its own **Status**; where the evidence is internal
consumers rather than canon, the tally is noted.

### `modules/grid-movement` — deferred

**Scope.** Discrete grid/tile movement: step-on-tick, snap-to-cell, occupancy
query, and a 180°-reversal guard. Distinct from `modules/grid-based` (which is
FOV / line-of-sight only, **not** movement).

**Status.** Deferred — and this is the case the deferral rule is *for*: three
consumers, three different shapes. snake has body-shift + reversal guard +
spatial occupancy, frogger has row-based hopping + water/road semantics, and
rpg uses free pixel movement with walkability checks. Three consumers, three
shapes — a fourth converging on one of them is the proof.

**Gate.** Shape — a fourth consumer converging on the shape below.

<details>
<summary>Details</summary>

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

**Status.** Speculative — genre-specific, and the canon *disagrees on the
shape*: Friday Night Funkin' judges against fixed hit windows, osu! against
per-object timing points, Rhythm Doctor against a calibration curve, and Web
Audio supplies only `AudioContext.currentTime` scheduling. Canon supplies a
function (judge a hit against a clock), not a shared model — and a single
consumer cannot pick one.

**Gate.** Shape — a second rhythm/timing prototype beyond `examples/rhythm`.

### App-host mount / teardown helper — speculative

**Scope.** A thin `start(container) => Teardown` contract with a lazy-load
race guard (stale-load token / CAS) for mount → cleanup → async-load →
teardown orchestration.

**Status.** Speculative — every example re-implements `start`/teardown, but
the contract is so thin that no single canon shape is worth committing to
(SPA mount/unmount lifecycles, micro-frontend `mount`/`unmount` contracts,
React root `createRoot`/`unmount` all differ).

**Gate.** Shape — a second app-host beyond `examples/hub`. Low priority; the
per-example `start` boilerplate is small.

### `modules/destructible-terrain` — ready

**Scope.** Mutable terrain: erase or modify tiles at runtime and keep the
collision mask, the rendered layer, and any path/FOV data in step.

**Status.** Ready — the same shape in Godot (`TileMap.erase_cell`), Unity
(`Tilemap.SetTile(null)`) and Phaser (`Tilemap.removeTileAt`), with
Worms-style destructible bitmaps as the archetype. Blocked only by the
batched tile layer it presumes.

**Gate.** Scheduling — depends on `modules/tilemap` V2 shipping the dirty-region
re-upload path. Track the two together.

<details>
<summary>Details</summary>

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

**Ladder.** Entries #18 (Worms), #19 (Dig Dug) and #20 (Motherload) are all
built on it — three consecutive games, none started.

</details>

### `modules/card-interaction` — ready

**Scope.** Two genre-clustered capabilities for card and deck games:
**zone/pile management** (move a card between hand ↔ deck ↔ discard, or stock
↔ waste, keeping pile metadata consistent) and **drag-and-drop hit-testing**
(reverse hit-test plus a legal-drop predicate).

**Status.** Ready — trigger met, 2 consumers agreeing on the same *operations*:
card-battler and solitaire. Compare `modules/grid-movement`, which stayed
deferred because three consumers turned out to have three shapes; here two
consumers agree on the operation surface.

**Gate.** Scheduling — build slot.

<details>
<summary>Details</summary>

**Evidence.** Both ABSENT in `src/`: no zone/pile helper (the tag swaps are
hand-rolled) and no hit-test / drop-predicate helper (card-battler and
solitaire each hand-roll reverse hit-testing for DOM and canvas).

**Representation choice to make during the build.** card-battler models zones
as *tags*, and tags emit no lifecycle event; a *component* model would get
`ComponentAdded` / `ComponentRemoved` reactivity for free. This does not change
the operation surface (move a card between piles; hit-test a drop), so it does
not gate the module — it is a design decision the plan settles. It also
decides whether the related ledger row (zone changes with no reactive hook)
closes or returns.

**Canon.** Unity UI drag handlers, Godot `Control` drag-and-drop, Phaser's
drag plugins, every card-game tutorial's hand-rolled pile manager.

</details>

---

## Existing-module gaps

Capabilities missing from a module that already ships — a leftover operation,
or a leftover slice, but not a new module. Each was left out of its V1 for a
reason worth recording, and the status says whether that reason still holds.

### `modules/input` — wheel + multi-touch — deferred

**Scope.** Scroll/wheel deltas and a multi-pointer set, beyond V1's position +
over-flag + buttons 0/1/2.

**Status.** Deferred — canon supplies the *function* but not a shared *shape*.
Unity exposes a polled signed delta (`Input.mouseScrollDelta`), Godot a
discrete wheel-button event carrying a `factor` (`InputEventMouseButton`), and
Phaser a `'wheel'` event object with `deltaX`/`deltaY`/`deltaZ` — state versus
event, vector versus discrete. The choice is load-bearing here rather than
incidental: the core raw-event union is
`{ kind: 'down' | 'up'; code: string }`, which cannot carry a wheel delta
without extending the core contract, and `PointerProvider` tracks a single
pointer today.

**Gate.** Shape — the model decision (a polled delta on `InputState`, or a new
event on the raw union), and whether multi-touch earns a multi-pointer set.
Demand already exists (`examples/tilemap` hand-rolls a wheel listener), so only
the shape is open.

<details>
<summary>Details</summary>

Single-finger touch already works through Pointer Events, so what is missing
is the wheel delta and the multi-pointer set — not the events themselves.

</details>

### `modules/spatial` — `QuadTree` / `BVH` backends — deferred

**Scope.** Additional `SpatialStructure` backends beside the shipped
`HashGrid2D`: a `QuadTree`, and a `BVH` / `SweepAndPrune` for AABB sets.

**Status.** Deferred — solid canon but not unanimous. The rule-book classes
quad-tree/BVH as domain-standard with an obvious API, which is its
one-consumer tier; `HashGrid2D` serves every current consumer, so nothing has
exercised either shape yet.

**Gate.** Shape — one consumer a uniform-grid backend cannot serve (very
uneven entity density, or static AABB sets).

<details>
<summary>Details</summary>

An `Octree` for the 3D stack is the other candidate; it stays out of scope
until a 3D consumer forces it. A continuous-space grid is *not* pending —
`ContinuousHashGrid2D` ships beside `HashGrid2D`.

**Related.** The rigid-body physics entry names a BVH / SweepAndPrune spatial
backend too; build it on this entry's backend rather than beside it.

</details>
