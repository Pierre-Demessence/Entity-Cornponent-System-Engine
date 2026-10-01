# Backlog

Everything not done, one entry each. An entry is deleted in the commit that
finishes it. Decisions not to build something are in
[decisions.md](decisions.md); the games ladder is in [roadmap.md](roadmap.md).

Module entries carry a status about their **shape**, with the evidence
(the engines that ship it, or the examples that need it), then their **gate**:

- **Ready** — the shape is proven; authorized to build, waiting only on a build
  slot. Never "wait for a second consumer" against a Ready entry.
- **Deferred** — the shape is believable but not pinned; the gate names what
  would pin it.
- **Speculative** — the shape is undetermined or canon is split.

The rules behind the statuses, version suffixes (V2, V3) and the gap-triage
process are in [extending-the-engine.md](extending-the-engine.md).

## Core

Engine internals under `src/`. Entry ids are stable references; a gap in the
numbering is an entry that left the list. Order by value: 3.9, 3.10 and 4.8
once a profile or consumer asks for them; 3.5 is the storage endgame.

### Tier 1 — Critical foundations

### Tier 2 — Robustness & correctness

### Tier 3 — Performance & large scale

- **3.5 Archetype tables** — gather-free multi-component iteration: group
  entities by component set into tables with aligned columns, so a
  multi-component query is one index loop instead of a per-store `slotOf`
  gather. Very long: a storage-engine rewrite above the shipped archetype cache.
  - Target the Bevy "both" model (each component picks table or sparse
    storage). Add/remove-component becomes a copy between tables (O(1) today);
    `query` / `get` / `set` stay unchanged. A table pass can also drop the
    iterator generator and per-entity tuple a cached `Query` allocates.
- **3.9 Change-filter iteration from the changed set** — when `added` /
  `changed` is the most selective term, iterate the store's recently-stamped
  ids (a per-store change log trimmed to the oldest live query window) instead
  of every matched entity. Trigger: a profile of filtered passes dominated by
  unchanged entities.
- **3.10 Spawn-path allocation** — `spawn` `structuredClone`s every template
  component and object-store components are fresh objects per entity.
  Candidates: skip the clone for all-numeric components, reuse value objects on
  respawn. Measure first; trigger: a profile showing spawn-path GC (see the
  game-of-life churn gap below).

### Tier 4 — Extensibility & developer experience

- **4.6 Inline-prose API-mention linter** — check backticked prose and
  non-runnable code fences in Manual sources against the public surface, the
  way `scripts/readme-symbols.ts` checks signature listings.
  - False-positive-bound: only 2 of 35 bare `` `foo()` `` prose mentions
    resolve to an export (the rest are members or external names), so it needs
    member-aware resolution (owner → type → members) or a conservative allowlist.
- **4.8 Entity-id remapping on merge-import** — an import entry point beside
  `loadJSON` (which stays a whole-world replace) that allocates fresh ids,
  rewrites row keys and id-valued fields, and returns the `old → new` map.
  Trigger: a mod/template pack, save merge or late-join feature, or a module
  that stores an `EntityId` in a component.
  - Id-valued fields are found through an `'entity'` field type in
    `simpleComponent` schemas or a per-def `remapRefs(value, map)` hook;
    `PileDef.items`, `InPileDef.pile` and `AttachDef.parent` need it. A
    reference to an entity absent from the payload maps to a dead id.
    `EntityAllocator.claim` serves an explicit mapping.

## Modules

### 2D module extensions

- **`RenderableDef` composite renderables** — **Ready**: one entity drawing
  several primitives, as a drawable list rather than a bigger union (Unity
  several `Renderer`s, Godot `CanvasItem` children, Phaser `Container`). Gate:
  finishing the `Renderable` surface; flappy's pipe pairs are the consumer.
- **`RenderableDef` billboard sprite + Canvas filters** — **Deferred**: doom is
  the only billboard consumer and three.js `Sprite` covers it; no request for
  `ctx.filter` effects. Gate: a second billboard consumer; a concrete filter
  request.
- **`modules/kinematics` V2 — slopes + one-way platforms** — **Ready**: Unity
  `PlatformEffector2D`, Godot `CharacterBody2D` one-way collision, GameMaker.
  Gate: a platformer (ladder rungs 15–17).
- **`modules/kinematics-3d` V2 — slopes + one-way platforms** — **Ready**:
  Godot `floor_max_angle` / `one_way_collision`, Unity
  `CharacterController.slopeLimit`, Unreal walkable-floor angle. Gate: a 3D
  platformer.
- **`modules/motion` V2 — radial force fields** — **Deferred**: radial
  attraction is a game-side force in Unity and Godot, so the function is canon
  but the shape is not; spacewar is the only consumer. Gate: a second radial
  consumer.
- **`modules/motion-3d` V2 — attitude control + spherical bounds** —
  **Deferred**: free-flight controllers and spherical arenas are game-specific
  in every engine; starfighter is the only consumer. Gate: a second consumer
  for either.
- **`modules/camera` V3 — rotation + parallax layers** — **Ready**: Godot
  `Camera2D.rotation`, Phaser `Camera.rotation`, Unity; per-layer scroll
  factors in all three. Gate: a scrolling prototype that needs either.
  - Rotation needs a full affine view and a conservative rotated-AABB cull (the
    cull is axis-aligned today). Parallax is a layer list with scroll factors
    that the renderer reads beside `view`, not a camera flag.

### 3D siblings

- **`modules/camera-3d` V2 — spring arm** — **Ready**: Godot `SpringArm3D`,
  Unreal `USpringArmComponent`, Cinemachine deoccluder; the probe is a
  callback, not a dependency on `collision-3d`. Gate: build slot.
- **`modules/camera-3d` — camera shake** — **Deferred**: engines split between
  a trauma model and an impulse model (Cinemachine); no example shakes. Gate: a
  consumer that shakes, choosing a model.
- **`modules/camera-3d` — blending + active-camera priority** — **Deferred**:
  Cinemachine brain, Godot `Camera3D.current`, Bevy `Camera::order`; every 3D
  example has one camera. Gate: a consumer that switches cameras.
- **`modules/camera-3d` — backend camera copy helper** — **Deferred**: doom,
  portal, platformer-3d and starfighter repeat the same eight lines, but the
  target is three.js-shaped and the engine does not depend on `three`. Gate: a
  second backend or a vendor-neutral target shape.
- **`modules/navmesh-3d`** — **Ready**: Recast/Detour, Godot
  `NavigationRegion3D`, Unity `NavMesh` (bake → regions → links → agent-radius
  inflation). Gate: a 3D consumer.
- **`modules/render-webgl` / `modules/render-webgpu`** — **Deferred**: the 3D
  examples render through three.js, which covers the need. WebGPU also needs
  the `[0, 1]` depth range `mat4Perspective` / `mat4Orthographic` do not
  produce. Gate: a consumer wanting the engine's `Renderer` interface for 3D.

### Rigid-body physics

- **Rigid-body physics** — **Deferred**: canon as a capability (PhysX, Godot,
  Chaos, Box2D, Rapier) but no two engines share an API. Gate: a prototype
  arcade physics cannot handle (stacking, ropes, ragdolls, vehicles) plus a
  backend choice.
  - Roll our own (AABB-only) or adapt `planck.js` / `rapier`; its BVH /
    sweep-and-prune backend is the `modules/spatial` entry below. A large
    ongoing commitment (tooling, debug views, determinism).

### Standard engine modules

- **`modules/parallel` — `parallelFor` over shared columns** — **Deferred**:
  `examples/parallel-kernel` proves the win (13 → 75 fps at 600k × 64) but its
  splitting is harness-local, and no engine's API transfers to browser workers.
  Gate: a second CPU-bound kernel consumer.
  - The kernel is a worker-defined module (closures cannot cross the worker
    boundary), and shared memory needs cross-origin isolation (`COOP`/`COEP`).
- **`modules/audio` V2 — event adapters, clip loading** — **Deferred**:
  conventions over a shipped module; each engine wires them differently. Gate:
  a second consumer sharing the event or clip-binding flow.
- **`modules/audio` V3 — 3D HRTF panning** — **Deferred**: Unity
  `spatialBlend`, Godot `AudioStreamPlayer3D`, Web Audio `PannerNode`; distance
  attenuation already works in 3D, only panning is 2D. Gate: a 3D consumer that
  needs positional audio.
- **`modules/audio` — occlusion** — **Speculative**: no engine ships it built
  in; it needs level geometry and a per-voice lowpass. Gate: a consumer with a
  geometry model and a concrete request.
- **`modules/animation` V2 — 2D rig, `TweenDef` component** — **Deferred**: 2D
  rig canon is thin (Godot `Skeleton2D`, Unity 2D Animation) and the tween
  component has no single shape. Gate: a consumer requesting either.
- **`modules/ui`** — **Speculative**: canon is split between ECS-native UI
  (`bevy_ui`) and a separate scene graph (Unity UGUI, Godot `Control`). Gate: a
  second prototype needing in-game widgets.
  - The most frequently missing surface for commercial-scale games (an
    inventory, level-up or menu layer); the interim path is DOM via
    `modules/render-dom`.
- **`modules/dialogue`** — **Speculative**: only the runner/presenter seam
  (`DialogueRunner` `advance()` / `choose(i)`, a `DialoguePresenter`), no
  script language or VM. Gate: a narrative prototype with branching.
  - rpg is strictly linear, so the choices model is unproven. Ink's runtime
    (`Continue` / `currentChoices` / `ChooseChoiceIndex`) is the verified shape;
    bundling Ink or Yarn would pick an authoring model for every consumer.
    Sequencing belongs to `modules/timeline`.
- **`modules/render-dom` V2** — **Deferred**: lifecycle-driven DOM updates and
  zone reparenting helpers; engines' reconcilers differ. Gate: a second
  DOM-heavy consumer.
- **`modules/render-target`** — **Ready**: render-to-texture through a
  secondary camera (Unity `RenderTexture`, Godot `SubViewport`, Unreal
  `SceneCaptureComponent2D`, three.js `WebGLRenderTarget`). Gate: build slot
  with the 3D render family.
  - portal hand-rolls it (`examples/portal/src/render.ts`). The portal
    transform, oblique near-plane clip and recursion stay in the example.
- **`modules/lighting`** — **Ready**: 2D lights and shadow-casting occluders
  (Godot `Light2D` + `LightOccluder2D`, Unity 2D Lights, Phaser `Light2D`);
  ship Godot's surface (texture, energy, colour, shadows, occluder polygons).
  Gate: a game about light or darkness.
- **`modules/scene` V2** — **Ready**: scene stack with push/pop, pause/modal
  layers and transitions (Unity `SceneManager`, Godot scenes, Bevy `States`).
  Gate: build slot.
- **`modules/timeline`** — **Ready**: sequenced multi-track playback (Unity
  Timeline, Godot `AnimationPlayer`, Unreal Sequencer). Gate: a prototype with
  a scripted sequence.
  - The engine ships the clock and a clip list (`{ startMs, durationMs, track }`);
    tracks (tween, camera, dialogue) are small adapters.
- **`modules/save` V2** — **Deferred**: slot policy and metadata schemas; no two
  engines agree. Gate: a second consumer needing a shared convention.
- **`modules/asset-loader` V2** — **Deferred**: manifest grouping, per-byte
  progress, hot-reload hooks; APIs differ across Addressables, Godot, Phaser and
  Bevy. Gate: a second consumer needing them.
- **`modules/tilemap` V2 — batched renderable** — **Ready**: a `TilemapDef` and
  a renderer pass drawing a layer in one go (Unity `Tilemap`, Godot `TileMap`,
  Phaser `Tilemap`). Gate: a grid large enough that per-cell entities hurt
  (`examples/tilemap` bakes to a bitmap as a workaround).
- **`modules/pathfinding` V2** — **Deferred**: JPS, flow fields,
  bidirectional, D\* Lite, smoothing, a heap open-set; engines leave these to
  libraries. Gate: per algorithm (many simultaneous pathers; a profile).
- **`modules/navmesh` (2D)** — **Deferred**: Godot ships a 2D variant
  (`NavigationPolygon`, `NavigationRegion2D`), Unity's is 3D only. Gate: a 2D
  game whose obstacles are not grid-aligned.
- **`modules/noise` V3** — **Deferred**: ridged / ping-pong fractals,
  cellular, value-cubic, domain warp (Godot `FastNoiseLite`, `noise-rs`). Gate:
  one consumer needing one.
- **`modules/grid-based` V2** — **Deferred**: permissive FOV, directional cones,
  richer visibility states; the set depends on the game. Gate: a second consumer
  needing one.
- **`modules/debug`** — **Ready**: gizmos, a diagnose-only entity inspector,
  frame and system timing graphs, dev builds only (Unity `Gizmos`, Godot
  debugger, Unreal `DrawDebugHelpers`). Gate: build slot.
- **`modules/steering` — `SteeringAgentDef` component** — **Deferred**: the
  pure-function surface is the proven shape. Gate: a consumer wanting the
  component form (see the steering-integration gap below).
- **`modules/fsm` V2** — **Ready** for hierarchical, parallel and history
  states (Unity Animator sub-state machines, Godot
  `AnimationNodeStateMachine`, Unreal state machines). The `FsmDef` component
  wrapper stays deferred. Gate: build slot.
- **`modules/behavior-tree` V2** — **Deferred**: `parallel`, `cooldown`,
  `repeat` decorators and a stateful tree; Unreal is the reference, Godot has
  none. Gate: a consumer needing one.
- **`modules/goap` V2** — **Deferred**: heap open-set, plan runner, typed
  facts; canon is papers, not engine APIs. Gate: a consumer needing one.
- **`modules/particles` V2** — **Ready**: sub-emitters, trails, collision,
  sprite particles (Unity `ParticleSystem`, Godot `GPUParticles2D`, Niagara).
  Gate: build slot.
- **`modules/ai` — Utility AI, HTN** — **Speculative**: neither has a canonical
  API. Gate: a prototype needing fuzzy trade-offs or task decomposition.
- **`modules/networking`** — **Speculative**: replication shapes diverge
  (Photon, Mirror, bevy_replicon, Unity Netcode). Gate: a scoped multiplayer
  prototype.
- **Local-multiplayer player-slot / input-owner helper** — **Deferred**: Unity
  `PlayerInputManager`, Unreal local-player index; local-pong and spacewar each
  kept an app-level union. Gate: a second local-multiplayer example converging
  on a slot model.

### Gameplay & utility modules

- **`modules/grid-movement`** — **Deferred**: snake, frogger, rpg, roguelike and
  pacman each move on a grid in a different shape. Gate: a further consumer
  converging on one of those shapes.
  - Likely shape: `GridPositionDef { col, row }`, a step on a movement tick,
    snap to cell centres, an occupancy lookup and a reversal guard.
- **`modules/rhythm`** — **Speculative**: hit-window, timing-point and
  calibration models disagree across rhythm games. Gate: a second rhythm
  prototype.
- **App-host mount / teardown helper** — **Speculative**: a `start(container) =>
  Teardown` contract with a lazy-load race guard; too thin for one shape. Gate:
  a second app host beside `examples/hub`.
- **`modules/destructible-terrain`** — **Ready**: runtime tile erase keeping
  collision, rendering and path data in step (Godot `erase_cell`, Unity
  `SetTile(null)`, Phaser `removeTileAt`). Gate: `modules/tilemap` V2's
  dirty-region re-upload; ladder rungs 18–20 need it.
- **World streaming / chunking** — **Speculative**: loading and unloading world
  regions around the player, with chunked or binary saves for large worlds
  (a save payload is one checksummed JSON string today); no example needs it.
  Gate: an open-world or farm-scale consumer.

### Existing-module gaps

- **`modules/input` — wheel + multi-touch** — **Deferred**: Unity polls a
  delta, Godot sends wheel-button events, Phaser a wheel event; the raw-event
  union cannot carry a delta and `PointerProvider` tracks one pointer. tilemap
  and game-of-life hand-roll a wheel listener. Gate: the model decision.
- **`modules/input` — rebinding registry** — **Deferred**: persisted overrides
  and conflict detection are settled canon (Godot `InputMap`, Unity Input
  System); the modifier-chord model is not, and no example remaps. Gate: a
  remapping consumer plus a chord model.
- **`modules/spatial` — `QuadTree` / `BVH` backends** — **Deferred**: solid
  canon, but `HashGrid2D` serves every consumer. Gate: one consumer a uniform
  grid cannot serve. An `Octree` waits for a 3D consumer.

## Website

- **Poster image per example** on the Examples pages — needs a capture step and
  a place for the images.
- **Cross-origin isolation for the hosted `parallel-kernel`** — GitHub Pages
  cannot send `COOP`/`COEP`, so its parallel mode is off on the published site;
  fixing it is a hosting choice.
- **Runnable example inside module guides** ("see it in use") — the manifest
  records the modules each example exercises, so it could drive an embedded
  stage on a module's Manual page.
- **Duplicate `/api/readme/` page** — TypeDoc emits the repo `README.md` even
  with `readme: 'none'`; nothing links to it.

## Docs

- **Broken glyph in the Utility AI line** — `docs/game-ai-landscape.md:30`
  shows `�` where a status emoji was.
- **Canon citation step contradicts the consumer-docs rule** — the Promotion
  Workflow in `docs/extending-the-engine.md` says to paste the canon reference
  into the module docs, which `AGENTS.md` forbids for READMEs and JSDoc.
- **Stale orientation claim in `collision-3d`** — its README says the engine has
  no orientation component for a `ShapeObb3Def` to pair with, but
  `modules/transform-3d` ships `Rotation3DDef`.
- **Backlog status in consumer docs** — the `collision`, `input`, `motion-3d`,
  `noise`, `pathfinding`, `render-canvas2d` and `spatial` READMEs cite backlog
  entries and their status, which `AGENTS.md` forbids in Manual pages.

## Examples

Adoption follow-ups: an example still hand-rolls something the engine ships.

- **snake** — adopt a `CameraDef` zoom instead of baking the cells → pixels
  scale into every renderable.
- **river-raid** — replace the summed sines in `game.ts` with `fbm1D`; changes
  the river's look, so it needs a playtest.
- **doom** — move enemy AI onto `modules/fsm` (an `AiDef` schema change:
  `mode: number` → `current: string` + `elapsedMs`); needs a playtest.
- **doom** — move pickups onto `makeTriggerSystem`, as platformer does.

## Untriaged engine gaps

The inbox for gaps the examples hit. Whoever builds an example adds a row
(symptom only, with an engine pointer and a pointer per consumer); a separate
triage pass turns each row into a module entry, a decision, or a fix, and
deletes it. Rules: [extending-the-engine.md](extending-the-engine.md#how-gaps-reach-the-engine).

| Gap (symptom) | Consumers | Engine today | Notes |
|---|---|---|---|
| `modules/attach`'s carrier path (`inheritVelocity`) has no adopter; only the follow case is used. | frogger (motivation) | `attach/attach.ts`; asteroids `game.ts:131` and spacewar `game.ts:173` use `snapPosition` only; frogger imports nothing from it | Adoption: migrate frogger's rider, or record the carrier path as canon-only. |
| Every steering consumer re-writes "velocity += force·dt, truncate to max speed" plus an ad-hoc brake. | boids, critters, stealth-guard, woodcutter | ABSENT: `steering/steering.ts:22,175` produces forces only. boids `flock.ts:91`, critters `tree.ts:38`, stealth-guard `systems.ts:94`, woodcutter `actions.ts:110` | Bears on the `SteeringAgentDef` entry. |
| AI brains live outside the ECS, in arrays on game state with an `activeX` pointer set around each tick. | critters (BT), stealth-guard (FSM), woodcutter (GOAP), pacman (FSM in a local `BrainDef`) | ABSENT: `fsm/fsm.ts:30,48` ships `makeFsm`/`tickFsm` only; BT and GOAP are pure functions. critters `game.ts:59`, stealth-guard `game.ts:74`, woodcutter `game.ts:50` | Bears on `FsmDef` and the BT/GOAP V2 entries. |
| Movement vector from four directional actions is computed and normalised by hand. | rpg, stealth-guard, doom, portal, platformer-3d | ABSENT: `input/input-state.ts:17` has `isDown`/`justPressed`/`justReleased` only. rpg `main.ts:296`, stealth-guard `systems.ts:31`, doom `input.ts:41`, portal `input.ts:36`, platformer-3d `input.ts:36` | |
| Despawn on leaving the play area is a hand-written sweep per scroller. | jetpack, flappy, river-raid, space-invaders | ABSENT: `lifetime/lifetime.ts:44` is time-based; `motion/motion.ts:19` boundaries wrap or clamp. jetpack `systems.ts:115`, flappy `systems.ts:87`, river-raid `systems.ts:193`, space-invaders `systems.ts:346` | river-raid's play area scrolls. |
| `Vec2` lacks `vec2Length`/`vec2Distance`/`vec2ClampLength`, so 2D code inlines `Math.hypot`. | boids, critters, stealth-guard, woodcutter, asteroids, spacewar, local-pong, pacman | ABSENT: `math/vec2.ts:9,22,40`, while `vec3.ts` ships all three. stealth-guard `states.ts:19`, woodcutter `actions.ts:49`, spacewar `input.ts:35` | |
| No uniform float in a range; `min + Math.random() * (max − min)` is re-typed. | flappy, boids, critters, jetpack, space-invaders, river-raid | ABSENT: `rng/rng.ts:14-46` has `randomInt`/`pick`/`shuffle`. flappy `game.ts:85`, boids `game.ts:86`, space-invaders `main.ts:110` | |
| Circle-vs-AABB push-out and avoidance of box obstacles are hand-rolled. | stealth-guard | ABSENT: `collision/narrowphase.ts:63` `aabbVsCircle` is boolean; `steering/steering.ts:233` avoids circles. stealth-guard `systems.ts:105,160` | One consumer. |
| A rAF tick source on a non-wall clock (`AudioContext.currentTime`) had to be written from scratch. | rhythm | ABSENT: `tick/animation-frame-tick-source.ts:8` injects `raf`/`cancelRaf` only. rhythm `audio.ts:87` | One consumer. |
| A tiny synchronous persisted value (a high score) is a copied `try { localStorage… }` pair. | breakout, space-invaders, frogger, river-raid, jetpack; pacman uses `LocalStorageBackend` (async, checksummed) | Wrong shape: `save/save-storage.ts:57,83,135` is a whole-save store. breakout `main.ts:22`, space-invaders `main.ts:36`, frogger `main.ts:33`, river-raid `main.ts:30`, jetpack `main.ts:27` | |
| Grid-cell movement, more shapes: roguelike keeps a cell per actor and tweens to the centre (turn-driven); pacman moves continuously between centres with a `decide(tile)` callback. | roguelike, pacman | ABSENT: no grid-movement module. roguelike `defs.ts` (`GridPosDef`), `rules.ts` (`moveTo`, `actorAt`); pacman `movement.ts` (`stepMover`) | Kept local. Evidence for the `modules/grid-movement` entry. |
| No way to keep entities out of a save; HUD and camera entities are serialized and rebuilt after load. | roguelike, game-of-life | ABSENT: `world.ts:584` `toJSON()` has no entity filter. roguelike `main.ts` (`adopt`), game-of-life `main.ts:219` | Kept local. |
| 4-way A\* needs `neighbors`, `cost` and `heuristic` passed together. | roguelike, pacman | Recipe only: `pathfinding/pathfinding.ts:18`. roguelike `ai.ts` (`chase`), pacman `systems.ts` (`ghostDecide`) | Kept local. Godot `AStarGrid2D.diagonal_mode` is the familiar preset. |
| The DEV `requires` warning depends on set order outside `spawn`, so `transferEntities` lists must put `position` first. | roguelike | `world.ts:494`; `RenderableDef.requires` at `render-canvas2d/renderable.ts:290`. roguelike `main.ts` (`PLAYER_COMPONENTS`) | Kept local. |
| `TurnCycler` is round-robin only; no speed / energy scheduling. | roguelike | `turn-based/turn-cycler.ts` `advance()`. roguelike `main.ts` (`runTurns`) | Kept local. rot.js `Scheduler.Speed`, libtcod energy. |
| World-space `text` fonts scale with the camera zoom, undocumented (`'bold 0.9px …'` under a 20× zoom). | pacman | `render-canvas2d/canvas2d-renderer.ts:177` `applyView`; `ScreenSpaceDef` is the escape hatch. pacman `game.ts` (`WORLD_FONT`) | Kept local. A README line would have saved the debugging. |
| One-shot audio still requires registering `AudioSourceDef`, or the first tick throws. | pacman | `audio/audio-system.ts` reads the store unconditionally. pacman `game.ts` (`makeWorld`) | Kept local. |
| After `clearAll()`, ids restart at 0, so a stale id names a new entity and `isAlive` answers `true`. | pacman | By design: `world.ts` `clearAll()` resets the allocator, documented in `src/world.md`. pacman `game.ts` (`startLevel`) | Kept local. |
| A `Timer` that starts already finished is built by ticking a fresh one for its full duration. | frogger, pacman | ABSENT: `timer/timer.ts` `makeTimer` starts full. frogger `game.ts:332`, pacman `game.ts` (`spentTimer`) | Kept local. |
| Structural churn is expensive: each spawn moves the entity one archetype bucket per component and clones every template component. | game-of-life | `archetype-index.ts:73` `moveEntity`; `world.ts:96` `_populateEntity`. game-of-life `systems.ts` (`rulesSystem`) | Kept local (cells become ghosts in place). Bevy and Flecs batch a spawn into one move. See core 3.10. |
| `enableSpatial` indexes every `PositionDef` holder, so HUD text and ghosts share the cells' index. | game-of-life | `world.ts:185`; no filter option. game-of-life `defs.ts:101` (`cellAt`) | Kept local. |
| Registering a list of component defs in a loop needs a cast. | roguelike, game-of-life | `world.ts:465` `registerComponent<T>`. roguelike `defs.ts:85`, game-of-life `defs.ts:43` | Kept local. |
| Sweeping and picking against a dense voxel grid loops over cells by hand. | minecraft | ABSENT: `collision-3d/narrowphase3.ts` has box, ray and plane tests, no grid traversal. minecraft `voxels.ts` (`sweepBox`, `raycastVoxels`) | |
