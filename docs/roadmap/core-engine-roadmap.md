# Core-Engine Roadmap

**Open core-internals work only.** Primitives in `src/` that underpin every
module and app: component stores, queries, scheduler, event bus, lifecycle,
validation, change detection, plugin/extension hooks. No modules, no gameplay
features.

**Entry IDs are stable references** (`3.2`, `3.5`, `4.6`). The numbering
is not contiguous: a gap means that entry shipped, moved to the module backlog,
or was declined, so citations elsewhere keep resolving to the same item. Shipped
core work is described by `src/` and dated by `git log`; where a plan exists it
sits under `plans/done/`, and core work performed before the engine split out is
in the Roguelike monorepo's `docs/plans/done/`.

Every entry's dependencies have shipped. The order at the bottom reflects
value, not a dependency graph.

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

---

## Tier 3 — Performance & Large Scale

Optimizations that matter once a game has 100+ entities on large maps with
complex systems.

### 3.5 Archetype Tables — gather-free multi-component iteration

| | |
|---|---|
| **Problem** | Columnar (SoA) storage shipped, but it is **sparse-set**: single-component iteration is a dense column loop, yet multi-component queries do a per-entity slot **gather** (`slotOf` per store, as `motion.ts` does). Bevy/DOTS-style gather-free iteration needs an entity's components **co-located** in one table — which sparse-set can't give. |
| **Solution** | Group entities by component set into **archetype tables** with aligned columns → a single-index loop, no gather. The top-tier form is the **"both" model** (Bevy): each component picks table vs sparse storage. The query / `get` / `set` API is preserved, so consumer code is unchanged. |
| **Unlocks** | The full multi-component iteration win on top of the storage/GC win the columnar store already delivers. A table-backed pass can also drop the two allocations a cached `Query` still makes per pass — the iterator generator and one `[id, ...values]` tuple per entity — e.g. through a column-loop `each` callback. |
| **Complexity** | Very long — a storage-engine rewrite. add/remove-component becomes a **structural move** (the entity is copied between tables), where sparse-set is O(1). |
| **Dependencies** | None outstanding — builds on the shipped columnar store, and sits **above** the shipped archetype *cache* (the lighter middle step: it caches query matches, keeping the gather). Detail + the full cheapest→biggest ladder: [../plans/done/ecs-parallelism-and-soa-storage.md](../plans/done/ecs-parallelism-and-soa-storage.md#the-path-beyond-middle--storage-architecture-logged). |

### 3.9 Change-filter iteration from the changed set

| | |
|---|---|
| **Problem** | An `added` / `changed` filter is a per-entity stamp check applied after archetype matching, so a pass costs O(matched entities) even when only a handful changed. |
| **Solution** | When a change filter is the most selective term, iterate the store's recently-stamped ids instead of the matched set — e.g. a per-store change log trimmed to the oldest live query window. |
| **Unlocks** | Change-driven systems over large, mostly-idle populations that cost O(changed) per pass. |
| **Complexity** | Mid — the log's trimming needs to know the oldest outstanding query window. |
| **Dependencies** | The shipped change ticks and `added` / `changed` filters. Trigger: a profile showing filtered passes dominated by unchanged entities. |

### 3.10 Spawn-path allocation

| | |
|---|---|
| **Problem** | Id recycling bounds the id space and the column store's pages, but each spawn still allocates: `spawn` `structuredClone`s (or spreads) every template component, and object-store (non-numeric) components are fresh heap objects per entity. |
| **Solution** | Measure first. Candidates: skip the clone for all-numeric components (the column store copies fields anyway), and reuse value objects for object-store components on respawn. |
| **Unlocks** | Allocation-free spawn/despawn churn for projectile- and particle-heavy games. |
| **Complexity** | Low–mid, depending on what a profile shows. |
| **Dependencies** | The shipped id recycling. Trigger: a profile showing spawn-path GC in a churn-heavy consumer. |

---

## Tier 4 — Extensibility & Developer Experience

Infrastructure that improves the development workflow and enables
modding/plugin support.

### 4.6 Inline-prose API-mention linter

| | |
|---|---|
| **Problem** | Module READMEs cite the API in prose (`` `world.spawn()` ``, `` `ctx.grid.cellsFor()` ``). Runnable examples are compiled and signature listings are name-checked (`scripts/doc-samples.ts`, `scripts/readme-symbols.ts`), but a method named only in a sentence, or inside a non-runnable code fence, is unchecked. |
| **Solution** | A name/member-existence linter over prose backticks and non-runnable fences, resolving each mention against the engine surface. |
| **Unlocks** | Catches "the cited method doesn't exist" doc rot everywhere, not just in verifiable blocks. |
| **Complexity** | Mid, and **false-positive-bound**: measured on the current corpus, only 2 of 35 bare `` `foo()` `` prose mentions resolve to an export — the rest are member names (`dispose()`, `play()`) or external refs (`move_toward()`). Needs member-aware resolution (owner → type → members) or a conservative allowlist before it is worth the noise. Deferred from [`../plans/done/readme-doc-symbol-linter.md`](../plans/done/readme-doc-symbol-linter.md). |
| **Dependencies** | The export enumeration in `scripts/engine-surface.ts`; the type checker for member existence on a named owner type. |

### 4.8 Entity-id remapping on merge-import

| | |
|---|---|
| **Problem** | A save can only replace a world, never join one. `loadJSON` wipes every store and restores the payload's id allocation, so loading into a fresh world is safe, but adding a save fragment to a populated world (mod or template pack, party import from another slot, late-join snapshot, editor-exported room) collides on ids. Component values that store an `EntityId` — `PileDef.items`, `InPileDef.pile`, `AttachDef.parent` — would also need rewriting. The gap already shapes APIs: `camera-3d` rigs target by tag because a stored id does not survive save/load ([`../plans/done/modules-camera-3d.md`](../plans/done/modules-camera-3d.md)). |
| **Solution** | A separate import entry point beside `loadJSON` (which stays a whole-world replace): allocate a fresh id per payload entity (or `claim` an explicit mapping), rewrite row keys, rewrite id-valued fields, and return the `old → new` map. Id-valued fields are found either through an `'entity'` field type in `simpleComponent` schemas (today they are declared `'number'`) or through an optional per-def `remapRefs(value, map)` hook for object-store components. A payload reference to an entity the payload does not contain maps to a dead id, not to whatever occupies that index. |
| **Unlocks** | Mod and template packs, save merging, prefab-as-save-fragment, network late-join — and components that store entity references without breaking persistence. |
| **Complexity** | Mid — ~100 lines of import plumbing, plus the schema field type or hook on every reference-carrying component and tests for each. |
| **Dependencies** | The shipped generational ids; `EntityAllocator.claim` is the primitive an explicit mapping uses. Trigger: a mod/template-pack, save-merge or late-join feature is scoped, or a new module wants to store an `EntityId` in a component. |

---

## Suggested Implementation Order

By value per unit of effort. Nothing here is scheduled; each entry still needs
its trigger.

1. **Change-filter iteration from the changed set** (3.9) — only once a profile
   asks for it
2. **Spawn-path allocation** (3.10) — only once a profile asks for it
3. **Entity-id remapping on merge-import** (4.8) — only once a merge or
   stored-reference consumer asks for it
4. **Archetype Tables** (3.5) — the storage-engine endgame; the biggest, most
   strategic piece, above the shipped cache
