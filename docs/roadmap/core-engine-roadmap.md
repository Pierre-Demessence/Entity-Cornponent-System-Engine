# Core-Engine Roadmap

**Open core-internals work only.** Primitives in `src/` that underpin every
module and app: component stores, queries, scheduler, event bus, lifecycle,
validation, change detection, plugin/extension hooks. No modules, no gameplay
features.

**Entry IDs are stable references** (`3.2`, `4.4`, `4.6`). A gap in the
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

### 3.5 Archetype Tables — gather-free multi-component iteration

| | |
|---|---|
| **Problem** | Columnar (SoA) storage shipped, but it is **sparse-set**: single-component iteration is a dense column loop, yet multi-component queries do a per-entity slot **gather** (`slotOf` per store, as `motion.ts` does). Bevy/DOTS-style gather-free iteration needs an entity's components **co-located** in one table — which sparse-set can't give. |
| **Solution** | Group entities by component set into **archetype tables** with aligned columns → a single-index loop, no gather. The top-tier form is the **"both" model** (Bevy): each component picks table vs sparse storage. The query / `get` / `set` API is preserved, so consumer code is unchanged. |
| **Unlocks** | The full multi-component iteration win on top of the storage/GC win the columnar store already delivers. |
| **Complexity** | Very long — a storage-engine rewrite. add/remove-component becomes a **structural move** (the entity is copied between tables), where sparse-set is O(1). |
| **Dependencies** | None outstanding — builds on the shipped columnar store, and sits **above** the shipped archetype *cache* (the lighter middle step: it caches query matches, keeping the gather). Detail + the full cheapest→biggest ladder: [../plans/done/ecs-parallelism-and-soa-storage.md](../plans/done/ecs-parallelism-and-soa-storage.md#the-path-beyond-middle--storage-architecture-logged). |

---

## Extensibility & Developer Experience

Infrastructure that improves the development workflow and enables
modding/plugin support.

### 4.4 Plugin / Hook Architecture

| | |
|---|---|
| **Problem** | All game logic lives in the core codebase. No extension points for mods or experimental features. |
| **Solution** | Lifecycle hooks: `onEntityCreated`, `onEntityDestroyed`, `onComponentSet`, `onTurnStart`, `onTurnEnd`. Plugins register via a manifest. |
| **Unlocks** | Modding support, experimental features without core changes, community content |
| **Complexity** | Long — ~400 lines. Hook registry + plugin loader + sandboxing. |
| **Dependencies** | None outstanding — the scheduler and `LifecycleEvent` shipped. `LifecycleEvent` covers created / destroyed / component-added / removed; the tick runner's tick-boundary reaping is the natural home for start/end hooks. |

### 4.6 Inline-prose API-mention linter

| | |
|---|---|
| **Problem** | Module READMEs cite the API in prose (`` `world.spawn()` ``, `` `ctx.grid.cellsFor()` ``). Runnable examples are compiled and signature listings are name-checked (`scripts/readme-samples.ts`, `scripts/readme-symbols.ts`), but a method named only in a sentence, or inside a non-runnable code fence, is unchecked. |
| **Solution** | A name/member-existence linter over prose backticks and non-runnable fences, resolving each mention against the engine surface. |
| **Unlocks** | Catches "the cited method doesn't exist" doc rot everywhere, not just in verifiable blocks. |
| **Complexity** | Mid, and **false-positive-bound**: measured on the current corpus, only 2 of 35 bare `` `foo()` `` prose mentions resolve to an export — the rest are member names (`dispose()`, `play()`) or external refs (`move_toward()`). Needs member-aware resolution (owner → type → members) or a conservative allowlist before it is worth the noise. Deferred from [`../plans/done/readme-doc-symbol-linter.md`](../plans/done/readme-doc-symbol-linter.md). |
| **Dependencies** | The export enumeration in `scripts/engine-surface.ts`; the type checker for member existence on a named owner type. |

---

## Suggested Implementation Order

By value per unit of effort. Nothing here is scheduled; each entry still needs
its trigger.

1. **Entity Pooling** (3.2) — kills spawn/despawn GC pressure
2. **Plugin Hooks** (4.4) — modding, long-horizon and the largest piece
3. **Archetype Tables** (3.5) — the storage-engine endgame; the biggest,
   most strategic piece, above the shipped cache
