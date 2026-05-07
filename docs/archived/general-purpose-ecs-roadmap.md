# General-Purpose ECS Roadmap

> **Archived 2026-05-07.** This document’s three roles — layering
> manifesto, step 1–7 migration narrative, and module catalog M1–M10
> — are no longer load-bearing. The migration completed (steps 1–6 are
> all ✅). The layering principles + promotion-paths rule-book +
> Tradeoffs + Prior Art sections moved into
> [../extending-the-engine.md](../extending-the-engine.md). The module
> catalog now lives in [../roadmap/ecs-module-backlog.md](../roadmap/ecs-module-backlog.md);
> the only entries here that weren’t already there — M9 AI, M10
> Networking — were ported to that file before archiving. Kept for
> historical context, not as a roadmap.

A long-horizon companion to
[../roadmap/core-engine-roadmap.md](../roadmap/core-engine-roadmap.md) and
[../plans/done/ecs-engine-audit.md](../plans/done/ecs-engine-audit.md).
See also [../roadmap/ecs-module-backlog.md](../roadmap/ecs-module-backlog.md) for deferred /
speculative / declined modules (camera, 3D siblings, audio, animation,
particles, tilemap, pathfinding, debug, scene, asset-loader, rigid-body
physics) with their promotion triggers.

## Status

**Aspirational / backlog.** Nothing here is scheduled. The current codebase
is a **turn-based, grid-based, single-player roguelike**, and every shortcut
that makes those assumptions is perfectly defensible **for this game**.
This document exists to answer "if we wanted to use this engine for a
platformer / real-time / 3D / multiplayer game, what would need to change?"
and to guide choices made today so we don't paint ourselves into a corner
unnecessarily.

## Why this document exists

The user asked a fair question: several items in the ECS audit (turn cycler,
integer-grid spatial index) quietly assume "turn-based + grid-based". Fine
for this project, but bakes domain into the engine. Every mature general ECS
(Bevy, flecs, EnTT, Unity DOTS) solves this via strict **layer separation**.
This document captures the layering we'd want and what each layer would look
like.

---

## Guiding Principles

## P1. Three layers, strictly enforced

| Layer | Contains | Knows about |
|---|---|---|
| **Core** | Entity IDs, component stores, tag stores, queries, scheduler, dirty tracking, deferred destroy, lifecycle events | Nothing else. No `{x, y}`. No `turnNumber`. No `ms`. |
| **Modules** | Spatial, time, input, render, physics, AI, audio, save — each a separate package | The core; maybe other modules via well-defined interfaces. |
| **App** | The game — composes modules, provides content, defines systems | Everything it wants. |

## P2. Good defaults, never mandatory assumptions

Every module exposes an **interface** and a **default implementation**. Users
can swap the implementation without changing the core or other modules.
`world.enableSpatial()` should accept any `SpatialStructure`, with
`HashGrid2D` as the convenient default for simple 2D grid games.

## P3. Pay for what you use

A simple game that imports only the core pays zero runtime cost for unused
modules. Tree-shakeable. No giant "ECS framework" object.

## P4. Composition, not inheritance

Modules don't `extends World` — they receive the world and wire themselves
in via the core's extension points (store hooks, lifecycle events, scheduler
registration). This is what makes them swappable.

## P5. Preset bundles for common game types

Ship opinionated factory functions:
`createRoguelikeWorld()`, `createPlatformerWorld()`,
`createRealtime3DWorld()`. Each wires the module combo common to that
genre. Beginners get turnkey setup; power users compose their own.

## P6. Promotion policy — three paths, not one

Primitives enter the engine via one of three paths:

- **Path A — Shape-validated (Rule of Three):** use when the API shape
  is opinionated or non-obvious. Requires ≥2 real internal consumers
  converging on the same helper. Default path.
- **Path B — Canon promotion:** use for primitives with a stable,
  well-established shape in game-engine literature (spatial hash,
  quad-tree / BVH, fixed-step tick, AABB sweep, ring buffer, command
  buffer). Ship when **one** real consumer can exercise it; do not
  demand three internal prototypes to justify existence when the
  external canon already does.
- **Path C — Universal canon:** use for primitives present in
  essentially every major engine with the same shape (z-order /
  opacity / scale / rotation / text / polygon / sprite / AABB /
  viewport). Ship with **zero** current consumers when canon is
  unanimous across ≥3 major production engines. Strict guardrails:
  minimal surface, no speculative knobs, demotable by default, cite
  three engines.

Guardrails for Path B/C: minimal surface, demotable, cite the canon
in the promotion rationale. See
[docs/extending-the-engine.md](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/docs/extending-the-engine.md)
for the full rule-book.

Examples under each path:

- **A:** turn cycler, combat log bridge, class/race registry,
  save-slot manager, any genre-specific helper.
- **B:** `HashGrid2D`, projection helpers (`cellOfPoint`,
  `cellsForAabb`), `FixedIntervalTickSource`, `EventBus`, future
  `QuadTree` / `BVH` / ring buffer.
- **C:** `RenderOrderDef`, `OpacityDef`, `ScaleDef`,
  `polygon` primitive, `text` primitive — things the engine must
  have to be a 2D engine.

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│ App Layer (game code)                                   │
│   - content, builders, game-specific systems            │
│   - game-specific tags/components                       │
└───────────┬─────────────────────────────────────────────┘
            │ imports & composes
┌───────────▼─────────────────────────────────────────────┐
│ Module Layer (each optional, each has default impl)     │
│ ┌──────────┐ ┌──────┐ ┌──────┐ ┌────────┐ ┌──────────┐  │
│ │ Spatial  │ │ Time │ │Input │ │ Render │ │  Save    │  │
│ └──────────┘ └──────┘ └──────┘ └────────┘ └──────────┘  │
│ ┌──────────┐ ┌───────┐ ┌──────┐ ┌────────┐              │
│ │ Physics  │ │ Audio │ │ AI   │ │  FOV   │              │
│ └──────────┘ └───────┘ └──────┘ └────────┘              │
└───────────┬─────────────────────────────────────────────┘
            │ uses
┌───────────▼─────────────────────────────────────────────┐
│ Core Layer — `src/ecs/`                                 │
│   World (registry) • ComponentStore • TagStore          │
│   QueryBuilder • Scheduler • EventBus • EntityTemplate  │
│   lifecycle events • deferred destroy • dirty flags     │
└─────────────────────────────────────────────────────────┘
```

---

## Module Catalog

## M1. Spatial ✅ DONE

Shipped as a two-layer split: core owns `SpatialStructure<TPos>` interface; concrete backends live in `@pierre/ecs/modules/spatial`. See [done/ecs-spatial-abstraction.md](../plans/done/ecs-spatial-abstraction.md).

**Interface** (`@pierre/ecs/spatial-structure`):

```ts
interface SpatialStructure<TPos> {
  add(id: EntityId, pos: TPos): void;
  remove(id: EntityId, pos: TPos): void;
  move(id: EntityId, from: TPos, to: TPos): void;
  queryAt(pos: TPos): Iterable<EntityId>;
  queryRect(min: TPos, max: TPos): Iterable<EntityId>;
  queryNear(pos: TPos, radius: number): Iterable<EntityId>;
  clear(): void;
}
```

Query methods return `Iterable<EntityId>` (minimum contract, lazy-backend friendly). Consumers that need `Set` semantics call `new Set(queryAt(pos))` explicitly.

**Implementations** to ship over time:

| Impl | Best for | Status |
|---|---|---|
| `HashGrid2D` (integer `{x,y}`) | Grid roguelikes, chess, tile strategy | ✅ shipped (`@pierre/ecs/modules/spatial`) |
| `HashGrid2D<{x,y: number}>` with cell-size | Continuous 2D (platformers, top-down action) | ✅ effectively shipped via M2-C projection helpers (`cellOfPoint`, `cellsForAabb`, `cellsForCircle`). Asteroids and platformer both instantiate `HashGrid2D`, project with the helpers, then `add(id, cellX, cellY)`. A dedicated `ContinuousHashGrid2D(cellSize)` wrapper is a Path-B candidate deferred until the manual pattern demonstrably hurts (current consumers find it ergonomic). |
| `QuadTree<{x,y: number}>` | Sparse 2D worlds | — (Path-B candidate) |
| `Octree<{x,y,z: number}>` | 3D games | — (Path-B candidate, blocked on first 3D consumer) |
| `BVH` / `SweepAndPrune` | Physics bodies (AABBs, not points) | — (Path-B candidate) |

`EcsWorld.enableSpatial(def, structure?)` accepts any `SpatialStructure<{x,y}>`; default backend is `new HashGrid2D()`. A second 2D impl drops in with zero `EcsWorld` changes. Generic `TPos` on `EcsWorld` itself is deferred until a pos-shape change (3D) actually forces it.

## M2. Time / Ticker ✅ DONE

Shipped as a two-layer split: core owns `TickInfo` + `TickSource` interfaces and the universal `TickRunner`; concrete sources live in `@pierre/ecs/modules/tick`. See [ecs-engine-audit.md B4](../plans/done/ecs-engine-audit.md#b4-extract-tickrunner-from-gameruns-systems--done) and [done/tick-runner-and-source.md](../plans/done/tick-runner-and-source.md).

**Interface** (`@pierre/ecs/tick-source`):

```ts
interface TickSource {
  subscribe(handler: (tickInfo: TickInfo) => void): () => void;
  start(): void;
  stop(): void;
}

interface TickInfo {
  readonly kind: 'discrete' | 'fixed' | 'variable';
  readonly tickNumber: number;
  readonly deltaMs?: number;  // absent for discrete (turn) sources
}
```

**Implementations:**

| Impl | Best for | Status |
|---|---|---|
| `ManualTickSource` | Turn-based — caller triggers `tick()` explicitly | ✅ shipped (`@pierre/ecs/modules/tick`) |
| `FixedTickSource(hz)` | Physics, deterministic real-time — fixed 60Hz | planned (first real-time prototype) |
| `AnimationFrameTickSource` | Rendering, animation — uses `requestAnimationFrame` | ✅ shipped (`@pierre/ecs/modules/tick`) |
| `HybridTickSource(fixedHz)` | Most real-time games — fixed for logic, variable for render | planned |

`TickRunner` (core) drives the universal per-tick ceremony in response to a `TickSource`. A tick is atomic; world swaps queue between ticks via `onTickComplete`. `tickNumber` replaces the previous hardcoded `turnNumber` bookkeeping inside `Game.runSystems()`.

## M3. Input ✅ DONE

Shipped as `@pierre/ecs/modules/input` — `InputProvider` interface in core
(`src/input-source.ts`), `KeyboardProvider` default, plus
`createInput(map, providers[])` returning an `InputState<TAction>` with
tick-boundary edge detection. See
[../plans/done/ecs-2d-engine-modules.md](../plans/done/ecs-2d-engine-modules.md)
Module 5.

All three example prototypes (snake/asteroids/platformer) consume it.
Roguelike migration via [../plans/keybinding-system.md](../plans/keybinding-system.md)
is a follow-up — that plan becomes a thin adapter on top of this module.

## M4. Render ✅ DONE (2D)

Shipped as `@pierre/ecs/modules/render` — `Renderer<TCtx>` interface in
core (`src/renderer.ts`), `Canvas2DRenderer` default
consuming `PositionDef + RenderableDef` (rect/circle/sprite variants). See
[../plans/done/ecs-2d-engine-modules.md](../plans/done/ecs-2d-engine-modules.md)
Module 6.

Asteroids and snake consume `Canvas2DRenderer` directly; platformer uses
it plus a custom overlay pass. Roguelike stays on `BaseRenderer` — no
migration forced. WebGL / WebGPU / terminal backends are future siblings
of `Canvas2DRenderer` under the same `Renderer<TCtx>` interface.

## M5. Serialization / Save

**Interface:** already exists in a primitive form. To generalize:

- Per-component versioning (audit item A10).
- Entity-ID remapping for import/merge (audit item A11).
- Pluggable storage backends (`IndexedDB`, `localStorage`, `FileSystem API`,
  cloud) — already partially abstracted in
  [src/persistence/storage-provider.ts](../src/persistence/storage-provider.ts).

## M6. Lifecycle events ✅ DONE

`EntityCreated`, `EntityDestroyed`, `ComponentAdded`, `ComponentRemoved`
are emitted on the `EcsWorld.lifecycle` bus (queue-based `EventBus`
drained by `endOfTick()`). Audit item **A3** is closed. The bus is
distinct from any game-specific event union — it describes structural
changes to the entity/component graph, so tooling can subscribe without
polluting gameplay events.

Set-replace semantics: writing to an already-present component emits
`ComponentRemoved` then `ComponentAdded`, so consumers treat the pair
as an update. `clearAll()` is silent by design (no per-entity events on
reset).

Prerequisite for plugin architecture (roadmap 4.4), network sync, and
the dev inspector (roadmap 4.2) — all three can now subscribe.

See [src/lifecycle.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/lifecycle.ts)
and the `lifecycle events` test block in
[src/world.test.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/world.test.ts).

## M7. Lifetime ✅ DONE (Path B)

`modules/lifetime` ships a `LifetimeDef { remainingMs }` component plus
`makeLifetimeSystem<TCtx>(options?)` factory. First shipped with the
asteroids migration (single internal consumer) under the Path-B canon
rule — external canon (Unreal `SetLifeSpan`, Unity `Destroy(obj, t)`,
Gregory §12.5) substituted for the second internal data point.
Roguelike status-effect timers are the expected next consumer.

Import: `@pierre/ecs/modules/lifetime`.

## M8. Physics

Two distinct layers; do not conflate.

**Arcade physics — `modules/kinematics` ✅ DONE.** Gravity, terminal
velocity, `GroundedDef`, axis-separated penetration resolution against
statics. Consumed by platformer. Canon: Phaser Arcade, Godot
`CharacterBody2D`, Unity `CharacterController`. See
[../plans/done/ecs-2d-engine-modules.md](../plans/done/ecs-2d-engine-modules.md)
Module 4. Paired shape/narrowphase primitives ship in `modules/collision`
(AABB, circle, swept AABB).

**Rigid-body physics — speculative.** Constraints, mass, restitution,
continuous collision across many dynamic bodies. Either roll our own or
adapt planck.js / rapier-js. Integrates with M1 Spatial via BVH. Only
needed if a prototype genuinely requires it — arcade covers platformers,
top-down action, and twin-stick shooters.

## M9. AI (speculative)

Current `AI` component is a string + target ID. Generalized would be
behavior trees / FSMs / GOAP as selectable components, each with its own tick
system.

## M10. Networking (speculative)

Client-authority, server-authority, delta-compression — all layered on top
of M6 lifecycle events + M5 serialization. Very long-horizon.

---

## Migration Path

This roadmap is explicitly **incremental**. Each step is independently
valuable and doesn't force subsequent ones.

## Step 0 — Original state (historical)

Snapshot of the starting point, kept here so the rest of the migration
narrative makes sense:

- Core was 80% clean (component store, query, scheduler, event bus
  were domain-neutral).
- `World` mixed core + game (audit item **B1**, closed by Step 1).
- Spatial was grid-only, hardcoded (audit **A7** + this doc's M1,
  closed by Step 3).
- Time was implicit (`turnNumber` in `Game` — closed by Step 4's tick
  source extraction).

## Step 1 — Extract generic `World` ✅ DONE

Plan: [../plans/done/ecs-generic-world.md](../plans/done/ecs-generic-world.md) (**B1**).

`EcsWorld` in [src/world.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/world.ts)
owns the engine surface (entity id allocation, component/tag stores,
queries, template spawn, serialization, opt-in spatial indexing, lifecycle
bus). The roguelike's `World` in [src/game/world.ts](../src/game/world.ts)
extends it with game-specific stores and helpers. No game imports from
engine code.

## Step 2 — Engine polish ✅ DONE

All five audit items from Section A that this step tracks have landed:

- **A1** Multi-observer hooks — ✅ `ComponentStore.subscribe(event, fn)`
  keeps per-event handler arrays; spatial index, DEV validation, dev
  inspector, and plugins all attach independently.
  See [component-store.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/component-store.ts).
- **A2** Deferred destroy — ✅ `EcsWorld.queueDestroy(id)` +
  `flushDestroys()` + `endOfTick()` (which also flushes the lifecycle
  bus). Safe to call during system iteration.
  See [world.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/world.ts).
- **A3** Lifecycle events — ✅ (see M6 below).
- **A6** System init/dispose — ✅ Scheduler calls `init(ctx)` on the
  next `run(ctx)` after `add()`, and `dispose(ctx)` after `remove()`
  or via `disposeAll(ctx)` at shutdown.
  See [scheduler.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/scheduler.ts).
- **A8** Composable templates — ✅ `composeTemplates(...templates)`
  shallow-merges components (last wins) and unions tags across inputs.
  See [template.ts](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/blob/main/src/template.ts).

## Step 3 — Abstract the spatial module (M1) ✅ DONE

Shipped as `SpatialStructure<TPos>` interface in core + `HashGrid2D` in `modules/spatial/`. Zero behavior change for the roguelike.

## Step 4 — Abstract the tick source (M2) ✅ DONE

Introduced `TickInfo` + `TickSource` interfaces and `TickRunner` ceremony in core; `turnNumber` out of `Game.runSystems()` — the game now drives a `ManualTickSource` from `@pierre/ecs/modules/tick`. The scheduler no longer knows about turns. The tick is atomic: level transitions queue between ticks, not mid-tick. Zero observable behavior change for the roguelike.

**After steps 1–4, the engine could theoretically power a platformer** by
swapping `HashGrid2D` → `QuadTree` and `ManualTickSource` → `FixedTickSource`,
keeping the same world / query / scheduler / event bus / template code.

## Step 5 — Preset bundles (P5) — deferred

Add a `createRoguelikeWorld()` factory (or equivalent per-genre preset)
that formalizes the current inline composition in
[src/game/world.ts](../src/game/world.ts). Low priority — the
prototypes shipped without it, so the layering is already validated
(see Step 6). Revisit if a second roguelike-shaped consumer appears
and the current `class World extends EcsWorld` boilerplate becomes
friction.

## Step 6 — Proof-of-concept second game ✅ DONE

Three prototypes have shipped — **snake**, **asteroids**, and
**platformer** — each consuming `@pierre/ecs` without touching engine
code. Snake validated tick source abstraction, asteroids validated
lifetime / collision / render-canvas2d / camera, platformer validated
kinematics + swept-AABB collision. The 2D engine modules they
motivated (all Path-A / Path-B promotions from multiple consumers) are
catalogued in
[../plans/done/ecs-2d-engine-modules.md](../plans/done/ecs-2d-engine-modules.md).

The layering is validated: adding a prototype is a new folder under
`examples/` plus game-specific content, with zero changes to
``. See
[prototype-games-roadmap.md](prototype-games-roadmap.md) for the full
ladder of prototypes (Snake → Asteroids → Platformer → 3D platformer
→ …), the rules that keep them honest, and the coverage matrix
against modules M1–M10.

## Step 7+ — Real-time modules

M3–M10 as and when needed. None should be done speculatively.

---

## Tradeoffs & Costs

## What it costs

- **Extra indirection.** `world.spatial.queryAt(x, y)` becomes
  `world.spatial.queryAt({x, y})` or similar — tiny but real. Interface
  dispatch in a hot loop can sting; profile and inline if needed.
- **More types.** Every module ships an interface + a default impl. Doubles
  the surface area.
- **Learning curve for contributors.** "Where does X go?" gets the answer
  "is it domain-neutral? core. is it common but swappable? module. else? app."
  Documented and enforced, this is fine.
- **Temptation to over-engineer.** The YAGNI trap is real. Each
  generalization must be justified by either (a) a concrete current need
  or (b) a concrete cost in the current non-general shape.

## What it saves

- **Reusability.** The engine survives a genre pivot without a rewrite.
- **Testability.** Mock implementations of any module let you test the
  core + other modules in isolation.
- **Modding.** Plugins (roadmap 4.4) fall out naturally once modules are
  well-separated.
- **Clearer mental model.** "Where does the turn counter live?" has a
  single correct answer (`TickSource`), not two (`Game` vs `World`).

---

## Prior Art

For anyone considering which layering to actually copy:

- **[Bevy](https://bevyengine.org)** — Rust. `bevy_ecs` is the model of
  layer separation. Worth reading the crate dependencies.
- **[flecs](https://www.flecs.dev/flecs/)** — C/C++, very fast, archetype-based.
  Has explicit "basic" and "addons" distributions.
- **[EnTT](https://github.com/skypjack/entt)** — C++, header-only, widely used
  in AAA (Minecraft: Bedrock). Strictly core-only; modules are community.
- **[BitECS](https://github.com/NateTheGreatt/bitECS)** — JS/TS,
  archetype-based, tiny. Example of a JS ECS that stays core-only.
- **[Unity DOTS](https://unity.com/dots)** — A cautionary tale of tight
  coupling to a single engine. Good for archetype algorithms;
  **do not copy** the way it's wedded to Unity's component system.

---

## Relationship to other documents

- [architecture-roadmap.md](architecture-roadmap.md) — **short-horizon**
  improvements to the current engine, most already done. Tier 1-4 work
  fits inside "Step 2" of this document.
- [../plans/done/ecs-engine-audit.md](../plans/done/ecs-engine-audit.md) — catalog of
  22 concrete items (A1-A12, B1-B10). This document is the
  **longer-horizon framing**; the audit items are the **near-term steps**.
- [../plans/ecs-generic-world.md](../plans/ecs-generic-world.md) — concrete
  plan for B1, which is Step 1 of this document.

---

## Items explicitly NOT pursued until a concrete driver appears

- M8 Physics, M9 AI framework, M10 Networking — no current gameplay
  requirement.
- Archetype storage (roadmap 3.1) — the current `Map<EntityId, T>` is fine
  for our entity counts. Archetype storage is the right answer **only** if
  we hit perf walls with large worlds.
- WebGPU renderer — the canvas 2D + tile atlas renderer covers our needs.

If any of these ever become a priority, they deserve their own plan file.
