# Engine readiness assessment

A genre-by-genre check of whether the current `@pierre/ecs` surface would
carry five commercial-scale games: **Vampire Survivors**, **Stardew
Valley**, **Hollow Knight**, **Factorio**, and **Subnautica**. Each is
assessed against the engine as it stands — what already fits, what is
missing, and what the missing piece costs.

Provenance for the claims below: the module tree under
[`src/modules/`](../src/modules/), the generated
[engine API catalog](agent/engine-api.md), the
[module backlog](roadmap/ecs-module-backlog.md), the
[engine gap ledger](roadmap/engine-gap-ledger.md), and the
[core-engine roadmap](roadmap/core-engine-roadmap.md). Capability claims
are marked **PRESENT** or **ABSENT** where they drive a verdict.

## Verdict summary

| Game | Would it ship on this engine today? | The load-bearing blocker |
| --- | --- | --- |
| **Vampire Survivors** | Yes for a strong vertical slice; strained at shipping scale | Simulation entity count (thousands of gems/enemies) — no pooling, no SoA, no archetype cache |
| **Stardew Valley** | Yes — but most of the work is app-side simulation + UI | No UI module; world-model primitives (crops, inventory, schedules) are deliberately not engine surface |
| **Hollow Knight** | Yes — the engine's home genre | Slopes / one-way platforms, animation clip registry, UI + dialogue, lighting |
| **Factorio** | No | Objects-in-a-`Map` storage, no SoA / pooling / workers, no chunk streaming, Canvas2D renderer |
| **Subnautica** | No | There is no 3D stack at all — only the generic layers (ECS, save, AI decision modules) carry over |

## What the engine already is

The parts that are above-average rather than merely present:

- **The tick ceremony is correct.** `TickRunner` (`src/tick-runner.ts`)
  runs systems, then flushes events, lifecycle, queued destroys, and dirty
  sets — atomically, in that order. Deferred destroy flushing only at
  end-of-tick is the right call, and the sequence most hand-rolled engines
  get wrong.
- **The scheduler declares `reads` / `writes`** (`src/scheduler.ts`).
  Nothing consumes that metadata for parallelism yet, but it is the hard
  half of ever doing so.
- **Dirty tracking plus `LifecycleEvent`** (`src/lifecycle.ts`) gives
  reactive hooks without per-frame polling.
- **Persistence is real infrastructure**, not `JSON.stringify` into
  localStorage: `MigrationRegistry`, integrity envelopes, backup rotation,
  orphan recovery, IndexedDB and localStorage backends
  (`src/modules/save/`).
- **The 2D camera is canon-complete** — Godot `Camera2D` parity minus
  rotation, including zoom, offset, limits, follow deadzone, and the
  zoom-aware `viewToWorld` needed for mouse picking, plus renderer-side
  view-rect culling.
- **The AI decision family shipped** — `fsm`, `behavior-tree`, `goap`,
  and `steering` (full Reynolds set plus flocking). That is a
  differentiator, not a checkbox.
- **The process is the real asset.** The gap ledger's "no citation → the
  claim is not trustworthy" rule, canon-first promotion, and 30-odd
  genre-diverse prototype consumers are what keep the engine
  domain-neutral.

## Game by game

### Vampire Survivors

**Fits already (PRESENT).** `modules/spawner` (wave cadence with a
difficulty-ramp provider callback), `modules/cooldown` (fire rate),
`modules/timer` + `modules/lifetime`, `modules/steering` (`seek` at the
player is literally the module), `ContinuousHashGrid2D` for hit and
proximity queries, `modules/particles`, `modules/animation`,
`modules/texture-atlas`, `modules/asset-loader`, camera follow with
deadzone, seeded `modules/rng`, `circleVsCircle` in `modules/collision`,
and the `modules/stats` overlay.

**Missing.**

- **The level-up card screen** — the game's actual core loop — is UI.
  There is no `modules/ui` (`PRESENT` as neither module nor core); the
  options are DOM via `modules/render-dom` (the card-battler precedent) or
  hand-drawn canvas. Real work, but not engine work.
- **Runtime scale (ABSENT).** Components are JS objects in a
  `Map<EntityId, T>`. No entity pooling (core roadmap Tier 3.2, unchecked),
  no archetype cache (Tier 3.1, unchecked), no SoA storage. A VS-like
  spawns and despawns thousands of things per minute — precisely the
  GC-stall shape `examples/stress-storage` exists to measure.
- **The renderer is close to the wall, but not the wall.**
  `Canvas2DRenderer` issues one `drawImage` per entity with no batching
  (`src/modules/render-canvas2d/canvas2d-renderer.ts`). View-rect culling
  helps a lot: a few hundred visible enemies is comfortable, two thousand
  is not.
- Pickup-on-overlap is an open ledger row (doom hand-rolls it) — trivial
  to compose, recorded for completeness.

**Verdict.** Prototype yes, ship no — and the gap is simulation storage
and GC pressure, not graphics.

### Stardew Valley

**Fits already (PRESENT).** The entire tile pipeline: `modules/tmx`
(parse) → `spawnTilemap` → `buildCollisionGrid` → `buildTilemapAtlas` →
D4 tile transforms, all in `modules/tilemap`; the 2D camera (follow,
deadzone, zoom, map limits); `modules/pathfinding` A\*;
`modules/grid-based` FOV and line-of-sight; sprite `modules/animation`;
`modules/asset-loader`; `modules/save` with versioned migrations;
`modules/tween` + `modules/easing` (growth curves, fades); `modules/timer`
and `modules/spawner` for day cadence; `modules/rng`; `modules/input`; and
`modules/render-dom` for panels.

**Missing — and it is the bulk of the game.**

- **UI:** inventory, hotbar, crafting, dialogue boxes, menus, tooltips.
- **World-model primitives:** crop growth state, inventory and stacking,
  crafting recipes, interaction targets, NPC schedules and calendar,
  relationship values. The ledger declines these as *content, not engine*
  (B14), which is defensible — but it means a simulation layer gets built
  on top rather than reused.
- **Persistence at farm scale.** `SaveEnvelope.payload` is a string with a
  checksum; there is no chunked, streamed, or binary save path. A 100×100
  farm modelled as per-cell entities serializes as a heavy JSON blob.
- **Tile rendering does not batch.** `spawnTilemap` spawns one entity per
  tile — proven correct at ~10k entities, and the backlog itself calls it
  wasteful. Baking a layer to an offscreen bitmap (the technique
  `examples/tilemap` already proved) stays consumer-side until the batched
  renderable ships.

**Verdict.** The 2D world, camera, art, and persistence foundation is
genuinely there. What is missing is a simulation layer the engine has
decided not to own.

### Hollow Knight

**Fits already (PRESENT).** `modules/kinematics` (gravity, axis-separated
X→Y AABB sweep, `Grounded`), `modules/collision` (swept AABB, bounce and
reflect), `modules/attach` with `inheritVelocity` for moving platforms
carrying a rider, `modules/fsm` + `modules/behavior-tree` + `modules/goap`
for enemy and boss brains, `modules/steering`, `modules/camera` with limits
and deadzone, `modules/tilemap` + `modules/tmx`, `modules/scene-transition`
for room swaps, `modules/save` for bench saves, `modules/particles`,
`modules/tween` + `modules/easing`, `modules/animation`, `modules/audio`
V1, `modules/input`, and `modules/cooldown` for i-frames.

**Missing.**

- **Slopes and one-way platforms (ABSENT).** A grep of `src/modules/**`
  finds no `oneWay` or slope handling in `collision` or `kinematics` — the
  only `slope` matches are shadowcasting math in
  `modules/grid-based/visibility.ts`. Hollow Knight leans on both
  constantly.
- **Animation clip registry** — deferred in the backlog; directional
  attack animation is app-side today.
- **UI and dialogue** again.
- **Lighting, shaders, post-FX** — Canvas2D only; there is no WebGL module
  in the tree.
- **Spatial audio and listener** — `modules/audio` V2 deferred.

**Verdict.** The closest fit of the five. Platformer physics, decision AI,
camera, tilemap, and save form a coherent whole; the gaps are a handful of
specific primitives rather than a missing foundation.

### Factorio

**Fits already (PRESENT).** `FixedIntervalTickSource` (nominal fixed dt),
seeded `rng` (determinism), scheduler `reads` / `writes` as a parallelism
foundation, `modules/tilemap` parse plus collision grid, `modules/spatial`.

**Missing — every item load-bearing.**

- **Storage layout (partially addressed).** The engine's own design capture
  ([`plans/done/ecs-parallelism-and-soa-storage.md`](plans/done/ecs-parallelism-and-soa-storage.md))
  states it plainly: objects in a `Map` is "the real blocker", and SoA
  storage is worth 2–10× single-threaded before parallelism is even
  considered, plus the elimination of per-entity GC. Its "Middle" slice —
  typed-array `ColumnStore` plus schema-inferred storage — has since
  shipped, but the archetype endgame has not. At factory scale the
  remainder is fatal, not a nice-to-have.
- **No parallel dispatch** — of that plan's three levers, message-passing
  offload (`modules/worker-pool` plus the `examples/worker-offload` harness)
  and the columnar storage slice have shipped; parallel *dispatch* (B2) is
  still open.
- **No pooling and no archetype cache**, while `QueryBuilder` intersects
  store key sets on every call.
- **No chunked or streaming world.** `HashGrid2D` is a single `Map` of
  cells; there is no simulation LOD and no notion of an abstracted chunk.
- **Renderer.** Canvas2D with no batching; a zoomed-out factory is tens of
  thousands of sprites.
- **Save.** String payload with a checksum; no compressed, binary, or
  incremental path.
- **UI** — Factorio is one of the most UI-heavy games in the medium.

**Verdict.** No. This is not "add four modules" — it is a different runtime
foundation.

### Subnautica

**Fits already (PRESENT), all of it dimension-agnostic.** ECS core,
scheduler, event bus, `modules/save` + `MigrationRegistry`,
`modules/asset-loader`, `modules/timer` + `modules/cooldown` +
`modules/spawner`, `modules/easing` + `modules/tween`, `modules/rng`,
`modules/stats`, the `modules/input` providers, `modules/scene-transition`,
and — usefully — `modules/fsm`, `modules/behavior-tree`, and
`modules/goap`, which are pure logic and not bound to 2D.
`SpatialStructure<TPos>` is generic in core, so a 3D backend drops in
without a core change.

**Missing.** The entire 3D stack. `transform`, `motion`, `collision`, and
`kinematics` are all 2D; there is no `transform-3d`, no 3D broadphase, no
mesh renderer, and no `Vec3` or quaternion type. Per the ledger,
`platformer-3d`, `portal`, `doom`, and `starfighter` each hand-roll a
three.js scene plus entity↔mesh sync; three of them also duplicate a 3D AABB
solver and two a ray-vs-AABB test. Beyond that: no terrain or
voxel system, no water or volumetric rendering, no navmesh, no world
streaming, and no rigid bodies for the submersible.

**Verdict.** No. A 3D engine would be built on top — and the four 3D
examples are already drifting in exactly the way the gap ledger exists to
prevent.

## The three gaps that repeat across genres

1. **UI.** Four of the five games need an inventory, level-up, dialogue, or
   menu layer, and there is no UI module — `modules/ui` is
   speculative-only in the backlog. The current paths are DOM via
   `modules/render-dom` or hand-drawn canvas. This is the most frequently
   missing surface in this list and the least glamorous.
2. **Runtime storage scale.** Objects in `Map`, no pooling, no archetype
   cache, no SoA, no workers. It bites Vampire Survivors at scale and kills
   Factorio.
3. **Renderer ceiling.** Canvas2D only, one draw call per entity, no
   batching, no WebGL or WebGPU. It bites VS late-game and kills Factorio
   and Subnautica.

## Smaller concrete holes relevant to these five

- **No slopes or one-way platforms** in `collision` + `kinematics`
  (verified absent) — Hollow Knight.
- **No 3D stack** — Subnautica, and four consumers already duplicating it.
- **No 3D ray-vs-AABB raycast** — the 2D query ships in `modules/collision`,
  but `portal` and `doom` still each copy the same 3D `rayAabb` — Subnautica
  picking.
- **No animation clip registry** (deferred) — Hollow Knight and Stardew
  directional animation.
- **No spatial audio or listener** (`modules/audio` V2 deferred).
- **No fixed-timestep accumulator with interpolation.**
  `AnimationFrameTickSource` emits variable dt and its own docs say
  consumers needing catch-up layer an accumulator on top.
- **No batched tilemap renderable** — per-cell entities only (see the
  tilemap V2 backlog entry).
- **No entity-id remapping on import** (deferred) — relevant the moment
  worlds are merged or third-party content is loaded.
- **No world streaming or chunking**, no navmesh, and no plugin or mod
  hooks (`core-engine-roadmap.md` 4.4).

## Ranked next moves

Ordered by games unlocked per unit of work.

| Move | Unlocks | Cost |
| --- | --- | --- |
| Promote the 3D stack that four examples already duplicate — `transform-3d`, 3D broadphase, 3D character controller, entity↔mesh sync, `Vec3`/`Quat`, ray-vs-AABB | Subnautica-class 3D; stops active consumer drift | Large |
| SoA hot-component storage (step B1) alone — worth it single-threaded, before any parallelism | VS at scale; Factorio step 1 | Large |
| Entity pooling + archetype cache (core roadmap 3.1 / 3.2) | VS at ship scale; any spawn-heavy genre | Mid |
| Slopes + one-way platforms | Hollow Knight to a comfortable yes | Small–mid |
| A UI module, or a documented DOM-UI recipe | Four of the five games | Mid |
| Batched tilemap renderable | Stardew and VS at real map sizes | Mid |
| WebGL or batched renderer | Factorio; dense 2D | Large |

The ordering carries one caveat: whether 3D is a real road is worth
deciding early. It is already a de-facto consumer cluster with four
duplicated implementations — the exact failure mode the gap ledger was
written to catch.

## Related open work

The batched tilemap renderable — `TilemapDef` plus a renderer pass that avoids
per-cell entities — is **unbuilt**. `TilemapDef` appears only in prose, never in
`src/`; `spawnTilemap` / `buildTilemapAtlas` / `buildCollisionGrid` are the
shipped half. Tracked as `modules/tilemap` V2 in the
[module backlog](roadmap/ecs-module-backlog.md).
