# Core-Engine Roadmap

**Open core-internals work only.** Primitives in `src/` that underpin every
module and app: component stores, queries, scheduler, event bus, lifecycle,
validation, change detection, plugin/extension hooks. No modules, no gameplay
features.

**Entry IDs are stable references** (`3.1`, `4.2`, `4.4`). A gap in the
numbering means that entry shipped and left this file, so citations elsewhere
keep resolving to the same item. Shipped core work is described by `src/` and
dated by `git log`; where a plan exists it sits under `plans/done/`, and core
work performed before the engine split out is in the Roguelike monorepo's
`docs/plans/done/`.

**Nothing here is blocked.** Every remaining entry's original dependencies
have shipped, so the order at the bottom reflects value, not a dependency
graph.

- Module-level work (camera, audio, render-dom, pathfinding, …) —
  [ecs-module-backlog.md](ecs-module-backlog.md)
- Declined core work — [non-goals.md](non-goals.md)
- Layering principles and the promotion rule-book —
  [../extending-the-engine.md](../extending-the-engine.md)

---

## Performance & Large Scale

Optimizations that matter once a game has 100+ entities on large maps with
complex systems.

### 3.1 Archetype Cache

| | |
|---|---|
| **Problem** | The query DSL intersects store key sets on every call. With 50+ components and frequent queries, that becomes expensive. |
| **Solution** | Cache entity→archetype mappings. An archetype is the set of component types an entity possesses. Queries match against archetype signatures. Cache invalidates when components are added/removed. |
| **Unlocks** | O(1) query matching instead of O(components) intersection, batch iteration by archetype |
| **Complexity** | Mid-Long — ~300 lines. Bitmask-based archetype signatures. |
| **Dependencies** | None outstanding — the query DSL shipped. |

### 3.2 Entity Pooling

| | |
|---|---|
| **Problem** | Entities are created/destroyed freely. Each destruction iterates all stores. Frequent spawn/despawn (projectiles, particles, summons) causes GC pressure. |
| **Solution** | Entity pool: destroyed entities are recycled (ID reused after a generation counter bump). Stores don't delete on recycle — they mark as inactive. Queries skip inactive entries. |
| **Unlocks** | Particle effects, projectile physics, summon spells without GC spikes |
| **Complexity** | Mid — ~150 lines. Generation counter + pool. |
| **Dependencies** | None outstanding — the query DSL (to filter inactive) and the spatial index both shipped. Confirm the spatial index copes with recycled IDs when this lands. |

> **Generational handles are the load-bearing, breaking part.** Entity ids are
> monotonic and **never reused** today (`createEntity` = `nextId++`), which is
> *safe* (a stale ref to a destroyed entity resolves to `undefined`) but grows
> the id space unbounded over churn-heavy sessions. Reusing ids without a
> generation reintroduces the **ABA problem** (a recycled id silently resolves
> to a different entity). The fix — packing `EntityId` into `{ index, generation }`
> — turns `EntityId` from a bare `number` into a handle, rippling through core,
> **every module, every consumer, and the save format**. That makes this a
> large, breaking, strategic change worth its own plan, justified only for a
> millions-of-entities-with-churn target (VS-like, Factorio). The paged sparse
> set already bounds the id→slot cost regardless, so nothing forces this yet.
> Full framing: [../plans/done/ecs-parallelism-and-soa-storage.md](../plans/done/ecs-parallelism-and-soa-storage.md#generational-entity-ids--logged-separate-strategic).

### 3.4 Render Layers & Culling

| | |
|---|---|
| **Problem** | The renderer receives the entire world. No z-ordering, no frustum culling. Everything renders every frame. |
| **Solution** | Render layers (terrain → items → entities → effects → UI overlays). Cull entities outside the viewport. Only re-render layers that changed (via dirty flags). |
| **Unlocks** | Particle effects, floating damage numbers, visual overlays, large maps without frame drops |
| **Complexity** | Mid — ~200 lines in a renderer refactor. |
| **Dependencies** | None outstanding — dirty flags and the spatial index shipped. Reconcile against what already exists before building: `RenderOrderDef` sorts drawables within the two-pass loop, and the camera's view-rect cull already drops off-screen entities. |

### 3.5 Archetype Tables — gather-free multi-component iteration

| | |
|---|---|
| **Problem** | Columnar (SoA) storage shipped, but it is **sparse-set**: single-component iteration is a dense column loop, yet multi-component queries do a per-entity slot **gather** (`slotOf` per store, as `motion.ts` does). Bevy/DOTS-style gather-free iteration needs an entity's components **co-located** in one table — which sparse-set can't give. |
| **Solution** | Group entities by component set into **archetype tables** with aligned columns → a single-index loop, no gather. The top-tier form is the **"both" model** (Bevy): each component picks table vs sparse storage. The query / `get` / `set` API is preserved, so consumer code is unchanged. |
| **Unlocks** | The full multi-component iteration win on top of the storage/GC win the columnar store already delivers. |
| **Complexity** | Very long — a storage-engine rewrite. add/remove-component becomes a **structural move** (the entity is copied between tables), where sparse-set is O(1). |
| **Dependencies** | None outstanding — builds on the shipped columnar store, and sits **above** the §3.1 archetype *cache* (the cache is the lighter middle step: cache query matches, keep the gather). Detail + the full cheapest→biggest ladder: [../plans/done/ecs-parallelism-and-soa-storage.md](../plans/done/ecs-parallelism-and-soa-storage.md#the-path-beyond-middle--storage-architecture-logged). |

### 3.6 Data-Parallel Dispatch over Shared Columns

| | |
|---|---|
| **Problem** | A CPU-bound per-entity kernel runs single-threaded even though columns can be `SharedArrayBuffer`-backed (`ColumnStore { shared: true }`, shipped). `examples/parallel-kernel` proves the win (13→75 fps at 600k×64, holds 75 fps at 1M), but its worker-splitting logic is **harness-local**, not a reusable primitive. |
| **Solution** | A reusable `parallelFor(kernel, range)` that splits a shared-column slot range across a worker pool behind a per-frame barrier. The kernel is a **worker-defined module** — JS closures can't cross the worker boundary, so general scheduler auto-dispatch of arbitrary systems is **out** (see the plan); the realizable form is data-parallel over shared columns. |
| **Unlocks** | ~Nx on genuinely CPU-bound simulation, bounded by core count — a multiplier on the columnar store, only where a kernel is already CPU-bound. |
| **Complexity** | Mid — the harness already works; promoting it to a module needs a **second consumer** (canon here gives a function, not a shape — no engine's parallelism API transfers to a browser worker pool), plus the cross-origin-isolation (`COOP`/`COEP`) caveat for plain browsers. |
| **Dependencies** | None outstanding — SAB columns and the `modules/worker-pool` helper both shipped. Detail: [../plans/done/ecs-parallelism-and-soa-storage.md](../plans/done/ecs-parallelism-and-soa-storage.md#b2--parallel-system-dispatch-core-needs-b1). |

---

## Extensibility & Developer Experience

Infrastructure that improves the development workflow and enables
modding/plugin support.

### 4.2 Entity Inspector (Dev Overlay)

| | |
|---|---|
| **Problem** | No way to see entity component values at runtime without console logging. |
| **Solution** | Dev overlay panel listing all entities and their components. Click an entity to inspect. Only enabled in dev mode. |
| **Unlocks** | Faster debugging, easier content balancing, live state inspection |
| **Complexity** | Mid — ~200 lines of UI. |
| **Dependencies** | None outstanding — the query DSL shipped. **Overlaps `modules/debug`** in the module backlog, whose scope already includes a live entity inspector; decide whether the inspector is core or belongs to that module. |

### 4.3 Content Hot-Reload

| | |
|---|---|
| **Problem** | Changing entity/item templates requires a full page refresh. |
| **Solution** | A mutable content registry with getter-based access. Content files self-register on first import and use `import.meta.hot.accept()` to re-register on an HMR update, so consumers read from the registry instead of importing values directly. Existing entities keep old stats; only new spawns pick up the change. |
| **Unlocks** | Rapid content iteration without restarting the game |
| **Complexity** | Short — ~40 lines of HMR wiring. |
| **Dependencies** | None outstanding — entity templates shipped, and this is the registry HMR would refresh. |

> **Provenance — restored to open on 2026-09-21.** This entry carried a
> `✅ DONE` marker. That was true of the Roguelike app it was written in
> (`src/content/registry.ts`, consuming `game.ts` / `entity.ts`), but not of
> this repo: there is no `src/content/`, and `import.meta.hot` appears nowhere
> under `src/` or `examples/`. As *engine* surface nothing is built, so it is
> open. Triage whether content hot-reload is engine work at all or a
> documented consumer-side Vite recipe — the same shape question the module
> backlog's app-host mount/teardown helper raises.

### 4.4 Plugin / Hook Architecture

| | |
|---|---|
| **Problem** | All game logic lives in the core codebase. No extension points for mods or experimental features. |
| **Solution** | Lifecycle hooks: `onEntityCreated`, `onEntityDestroyed`, `onComponentSet`, `onTurnStart`, `onTurnEnd`. Plugins register via a manifest. |
| **Unlocks** | Modding support, experimental features without core changes, community content |
| **Complexity** | Long — ~400 lines. Hook registry + plugin loader + sandboxing. |
| **Dependencies** | None outstanding — the scheduler and `LifecycleEvent` shipped. `LifecycleEvent` covers created / destroyed / component-added / removed; the tick runner's tick-boundary reaping is the natural home for start/end hooks. |

### 4.5 Centralized Keybinding Registry

| | |
|---|---|
| **Problem** | Two hardcoded key maps in the Roguelike app (`input.ts`, `panel-keys.ts`). No rebinding, no modifier keys, no conflict detection. |
| **Solution** | A single `KeybindingRegistry` with default bindings, player overrides persisted to localStorage, conflict detection, and modifier-key support. |
| **Unlocks** | Accessibility (input remapping), complex key combos, an in-game controls reference panel |
| **Complexity** | Mid. A plan was written for this in the Roguelike monorepo (`keybinding-system.md`) but was not ported here. |
| **Dependencies** | None outstanding. **Overlaps `modules/input`**, which ships `InputMap` plus Keyboard/Pointer/Gamepad providers — check what a registry adds beyond that before building. |

---

## Suggested Implementation Order

By value per unit of effort. Nothing here is scheduled; each entry still needs
its trigger.

1. **Archetype Cache** (3.1) — the biggest query-cost win, and the cheapest of
   the three scale items
2. **Entity Pooling** (3.2) — kills spawn/despawn GC pressure
3. **Render Layers & Culling** (3.4) — unlocks dense visual effects
4. **Content Hot-Reload** (4.3) — ~40 lines for faster content iteration
5. **Keybinding Registry** (4.5) — accessibility, small and self-contained
6. **Entity Inspector** (4.2) — dev quality of life
7. **Plugin Hooks** (4.4) — modding, long-horizon and the largest piece
8. **Data-Parallel Dispatch** (3.6) — a reusable module over the shipped SAB
   columns; gated on a second consumer, since no engine's parallelism API
   transfers to a browser worker pool (a shape gap, not effort)
9. **Archetype Tables** (3.5) — the storage-engine endgame; the biggest,
   most strategic piece, above the §3.1 cache
