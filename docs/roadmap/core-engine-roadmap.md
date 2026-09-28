# Core-Engine Roadmap

**Open core-internals work only.** Primitives in `src/` that underpin every
module and app: component stores, queries, scheduler, event bus, lifecycle,
validation, change detection, plugin/extension hooks. No modules, no gameplay
features.

**Entry IDs are stable references** (`2.6`, `3.2`, `4.7`). The numbering
is not contiguous: a gap means that entry shipped, moved to the module backlog,
or was declined, so citations elsewhere keep resolving to the same item. Shipped
core work is described by `src/` and dated by `git log`; where a plan exists it
sits under `plans/done/`, and core work performed before the engine split out is
in the Roguelike monorepo's `docs/plans/done/`.

**One entanglement to note.** 3.2's id recycling reintroduces the ABA problem —
recycling ids without a generation counter. Every other entry's dependencies
have shipped. The order at the bottom reflects value, not a dependency graph.

- Module-level work (camera, audio, render-dom, pathfinding, …) —
  [ecs-module-backlog.md](ecs-module-backlog.md)
- Declined core work — [non-goals.md](non-goals.md)
- Layering principles and the promotion rule-book —
  [../extending-the-engine.md](../extending-the-engine.md)

---

## Tier 1 — Critical Foundations

---

## Tier 2 — Robustness & Correctness

Holes that turn into corruption or missing capability once the entity set is
large or re-shaped during a tick.

### 2.6 Spatial integration generalized

| | |
|---|---|
| **Problem** | `SpatialStructure<TPos>` is generic, but the world's wiring is not: `enableSpatial` / `move` / `spatial` are hard-wired to `{x, y}`, and a world may index exactly one component. (The backend is already caller-supplied; the world names none.) So a 3D game cannot use the core integration at all, and a 2D game cannot index two populations (bodies plus pickups). |
| **Solution** | Make the world's spatial wiring generic in `TPos` and allow more than one indexed set. |
| **Unlocks** | 3D broadphase through the core instead of per-consumer brute force, and per-purpose indexes inside one world. |
| **Complexity** | Mid — the interface already generalizes; the work is the world's plumbing and its typing. |
| **Dependencies** | None outstanding. Distinct from the module backlog's `QuadTree` / `BVH` entries, which add backends rather than generalize this wiring. |

---

## Tier 3 — Performance & Large Scale

Optimizations that matter once a game has 100+ entities on large maps with
complex systems.

### 3.2 Entity Pooling

| | |
|---|---|
| **Problem** | Entities are created/destroyed freely. Each destruction iterates all stores. Frequent spawn/despawn (projectiles, particles, summons) causes GC pressure. |
| **Solution** | Entity pool: destroyed entities are recycled (ID reused after a generation counter bump). Stores don't delete on recycle — they mark as inactive. Queries skip inactive entries. |
| **Unlocks** | Particle effects, projectile physics, summon spells without GC spikes |
| **Complexity** | Mid — ~150 lines. Generation counter + pool. |
| **Dependencies** | None outstanding — the query DSL (to filter inactive) and the spatial index both shipped. Confirm the spatial index copes with recycled IDs when this lands, and settle the generation counter as part of this work. |

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

### 3.5 Archetype Tables — gather-free multi-component iteration

| | |
|---|---|
| **Problem** | Columnar (SoA) storage shipped, but it is **sparse-set**: single-component iteration is a dense column loop, yet multi-component queries do a per-entity slot **gather** (`slotOf` per store, as `motion.ts` does). Bevy/DOTS-style gather-free iteration needs an entity's components **co-located** in one table — which sparse-set can't give. |
| **Solution** | Group entities by component set into **archetype tables** with aligned columns → a single-index loop, no gather. The top-tier form is the **"both" model** (Bevy): each component picks table vs sparse storage. The query / `get` / `set` API is preserved, so consumer code is unchanged. |
| **Unlocks** | The full multi-component iteration win on top of the storage/GC win the columnar store already delivers. |
| **Complexity** | Very long — a storage-engine rewrite. add/remove-component becomes a **structural move** (the entity is copied between tables), where sparse-set is O(1). |
| **Dependencies** | None outstanding — builds on the shipped columnar store, and sits **above** the shipped archetype *cache* (the lighter middle step: it caches query matches, keeping the gather). Detail + the full cheapest→biggest ladder: [../plans/done/ecs-parallelism-and-soa-storage.md](../plans/done/ecs-parallelism-and-soa-storage.md#the-path-beyond-middle--storage-architecture-logged). |

### 3.7 Change-detection query filters

| | |
|---|---|
| **Problem** | Stores track which ids are dirty, but nothing can query that: a system that cares only about what changed must iterate everything and test per entity. The tracking is also semantically uneven — mutating a value returned by an object-store `get(id)` does not mark it, while the columnar write-through view marks on assignment — so a filter built on it today would silently under-report. |
| **Solution** | An `Added` / `Changed` filter on the query surface, over a settled contract: either every write path marks dirty, or the filter is documented as opt-in tracking with the mutation sites that must call `markDirty` listed. Canon: Bevy `Added` / `Changed`, Unity DOTS `WithChangeFilter`. |
| **Unlocks** | Change-driven systems — re-derive on edit, sync only what moved, stay idle on a quiet tick — without per-entity polling. |
| **Complexity** | Small surface over shipped machinery; the cost is the contract, not the code. |
| **Dependencies** | The shipped dirty tracking (`markDirty` / `isDirty` on both store types) and the shipped query predicate surface. |

### 3.8 Cached query handles + typed arity beyond four

| | |
|---|---|
| **Problem** | Every `world.query(...)` call builds a builder and derives a string cache key (`required:excluded`) before the archetype cache is consulted, so a per-tick system pays an allocation it does not need. Separately, the typed overloads stop at four component defs, so a five-component query does not type-check at all. |
| **Solution** | A reusable query handle, resolved once and iterated per tick, plus variadic tuple typing so arity is not a cliff. Canon: Bevy system params, Flecs cached queries. |
| **Unlocks** | Query-heavy systems without per-tick allocation, and queries over five or more components that keep their types. |
| **Complexity** | Mid — the match cache already exists; the work is a handle that owns it, plus the typing. |
| **Dependencies** | The shipped archetype cache and query predicate surface, whose shape the handle would freeze. |

---

## Tier 4 — Extensibility & Developer Experience

Infrastructure that improves the development workflow and enables
modding/plugin support.

### 4.6 Inline-prose API-mention linter

| | |
|---|---|
| **Problem** | Module READMEs cite the API in prose (`` `world.spawn()` ``, `` `ctx.grid.cellsFor()` ``). Runnable examples are compiled and signature listings are name-checked (`scripts/readme-samples.ts`, `scripts/readme-symbols.ts`), but a method named only in a sentence, or inside a non-runnable code fence, is unchecked. |
| **Solution** | A name/member-existence linter over prose backticks and non-runnable fences, resolving each mention against the engine surface. |
| **Unlocks** | Catches "the cited method doesn't exist" doc rot everywhere, not just in verifiable blocks. |
| **Complexity** | Mid, and **false-positive-bound**: measured on the current corpus, only 2 of 35 bare `` `foo()` `` prose mentions resolve to an export — the rest are member names (`dispose()`, `play()`) or external refs (`move_toward()`). Needs member-aware resolution (owner → type → members) or a conservative allowlist before it is worth the noise. Deferred from [`../plans/done/readme-doc-symbol-linter.md`](../plans/done/readme-doc-symbol-linter.md). |
| **Dependencies** | The export enumeration in `scripts/engine-surface.ts`; the type checker for member existence on a named owner type. |

### 4.7 System run conditions / enable flags

| | |
|---|---|
| **Problem** | A registered system runs every tick. "Only while not paused", "only in this game phase", "only when this feature is on" has to be re-checked inside the system body, where the scheduler cannot see it — so ordering and access checks are computed over systems that will not actually run. |
| **Solution** | An optional `condition` (or `enabled`) predicate on `SchedulableSystem`, evaluated before `run`, alongside the existing `phase` and dependency fields. Canon: Bevy `run_if` / `in_state`, Unity DOTS `Enabled` / system groups. |
| **Unlocks** | Pause, menus and mode switches expressed where the scheduler holds them, and ordering diagnostics that know a system was skipped. |
| **Complexity** | Small. |
| **Dependencies** | None outstanding. |

---

## Suggested Implementation Order

By value per unit of effort. Nothing here is scheduled; each entry still needs
its trigger.

1. **Change-detection filters** (3.7) — a small surface over machinery that
   already ships
2. **System run conditions** (4.7) — small
3. **Cached query handles + typed arity** (3.8) — pays off in query-heavy ticks
4. **Spatial integration generalized** (2.6) — stops the 3D consumers drifting
5. **Entity Pooling** (3.2) — kills spawn/despawn GC pressure
6. **Archetype Tables** (3.5) — the storage-engine endgame; the biggest, most
   strategic piece, above the shipped cache
