# Architecture Improvement Roadmap

Pure engine / ECS / infrastructure improvements — no gameplay features.
Ordered by dependency: earlier tiers unblock later ones.

## Current State (post generic component store)

- 8 component types + 3 tags in a generic `ComponentStore<T>` / `TagStore` registry (`src/ecs/`)
- 4 systems running sequentially: PlayerAction → AI → FOV → Render
- O(n) position queries for collision, item pickup, occupancy checks
- Queue-and-flush EventBus (`src/ecs/event-bus.ts`) with typed handlers
- 3 entity factory functions (player, item, enemy) in `src/game/entity.ts`
- JSON serialization with `ComponentDef.serialize/deserialize`
- Hardcoded key map, manual UI sync

---

## Tier 1 — Critical Foundations

These are the highest-leverage improvements. Each one removes a concrete
scalability wall and makes every subsequent feature cheaper to build.

### 1.1 Spatial Index ✅ DONE

| | |
|---|---|
| **Problem** | `getBlockingAt()`, `getItemsAt()`, `isOccupied()` iterate ALL positions — O(n) per call. Called multiple times per turn by multiple systems. |
| **Solution** | Spatial hash grid: `Map<cellKey, Set<EntityId>>`. Auto-maintained when positions change (set/delete hooks on `ComponentStore`). New file: `src/ecs/spatial.ts`. |
| **API** | `world.spatial.getAt(x, y)`, `world.spatial.getInRadius(x, y, r)`, `world.spatial.getInRect(x1, y1, x2, y2)` |
| **Unlocks** | Ranged combat, AoE spells, A* pathfinding, large maps, multi-floor navigation |
| **Complexity** | Short — ~150 lines. Wire into position store's set/delete. |
| **Dependencies** | None (standalone) |

### 1.2 Entity Query DSL ✅ DONE

| | |
|---|---|
| **Problem** | Systems manually iterate specific stores and cross-reference others with ad-hoc `if` checks. Adding filters (alive, in-range, has-component) duplicates logic everywhere. |
| **Solution** | Fluent query builder: `world.query(PositionDef, FighterDef).without(DeadTag).run()` returning an iterator of `[EntityId, Position, Fighter]` tuples. New file: `src/ecs/query.ts`. |
| **Implementation** | Intersect the `keys()` of requested ComponentStores; exclude keys present in excluded TagStores. |
| **Unlocks** | Clean system code, easy component filtering, foundation for archetype caching |
| **Complexity** | Short — ~100 lines. Builds on the existing component registry. |
| **Dependencies** | Generic component store (done) |

### 1.3 System Scheduler (Dependency Graph) ✅ DONE

| | |
|---|---|
| **Problem** | 4 systems in a hardcoded array. Adding more requires knowing the implicit order contract. No way to express "run after X" or "run before Y". |
| **Solution** | DAG-based scheduler. Systems declare `runAfter` / `runBefore` dependencies. Engine topologically sorts them once at startup. Optional: phase grouping (input → logic → render). New file: `src/ecs/scheduler.ts`. |
| **Unlocks** | 50+ systems without order confusion, system hot-plug, conditional system skipping |
| **Complexity** | Mid — ~200 lines. Toposort + phase tags. |
| **Dependencies** | None (standalone). But benefits from query DSL. |

---

## Tier 2 — Robustness & Scale

Improvements that make the engine robust at 50+ components, 100+
entities, and frequent content changes.

### 2.1 Component Validation ✅ DONE

| | |
|---|---|
| **Problem** | Nothing prevents creating a Fighter without a Position, or an AI without a Renderable. Bugs surface at runtime, not creation time. |
| **Solution** | `ComponentDef<T>` gains optional `requires?: ComponentDef[]`. On `store.set(id, value)`, assert all required stores contain `id`. Dev-mode only (strip in prod build). |
| **Unlocks** | Catches entity assembly bugs immediately, enforces architectural invariants |
| **Complexity** | Short — ~30 lines in `ComponentStore.set()`. |
| **Dependencies** | Generic component store (done) |

### 2.2 Entity Templates / Prefab System ✅ DONE

| | |
|---|---|
| **Problem** | 3 factory functions manually call `store.set()` for each component. Adding a new component means updating every factory. Templates (`EnemyTemplate`, `ItemTemplate`) are external objects with no formal schema. |
| **Solution** | Declarative entity templates: `{ components: { [def.name]: data }, tags: [tagName] }`. Generic `world.spawn(template)` that iterates the template and populates registered stores. |
| **Unlocks** | Data-driven entity creation, hot-reloadable templates, mod support, auto-transfer on level change |
| **Complexity** | Mid — ~120 lines. Template schema + generic spawner. |
| **Dependencies** | Generic component store (done). Better with component validation (2.1). |

> **Future evolution:** When enemies gain inventories/equipment (see IDEA-BOX "Enemy equipment system"), unify `enemy()` and `player()` builders into a single `creature()` builder with optional AI, inventory, and equipment fields.

### 2.3 Serialization Schema Evolution ✅ DONE (infra only)

| | |
|---|---|
| **Problem** | Save format is version-locked. Adding/removing/renaming a component breaks old saves unless manually handled. Current approach: hardcoded `if (version === 1)` branches. |
| **Solution** | `MigrationRegistry` with `register(from, to, fn)` and `run(blob, saved, target)` chain runner. `parseSaveBlob()` delegates to the registry. Uses integer versions; `SAVE_VERSION = 0` signals dev mode (no migrations registered — incompatible saves are rejected). Bump to `1+` for production. |
| **Unlocks** | Fearless refactoring — any component can be renamed/restructured without breaking saves |
| **Complexity** | Mid — ~100 lines. Migration registry + chain runner. |
| **Dependencies** | Generic component store (done) |

### 2.4 Event System Enhancements ✅ DONE

| | |
|---|---|
| **Problem** | (a) No event priorities — handlers fire in registration order. (b) No event consumption — all handlers always run. (c) Events emitted inside handlers queue for next flush, creating multi-turn delays for chain reactions. |
| **Solution** | (a) Priority field on handlers (higher = first, default 0). (b) `ctx.stopPropagation()` via EventContext. (c) Nested flush: handler-emitted events drain in subsequent batches within the same flush, depth-limited (default 3). Handler signature: `(event, ctx)`. `on()` returns unsubscribe function. |
| **Unlocks** | Complex event chains (attack → death → loot drop → quest check) in a single turn, event-driven AI reactions |
| **Complexity** | Mid — ~80 lines of changes to EventBus. |
| **Dependencies** | None (standalone) |

---

## Tier 3 — Performance & Large Scale

Optimizations that matter once the game has 100+ entities on large
maps with complex systems.

### 3.1 Archetype Cache

| | |
|---|---|
| **Problem** | Query DSL (1.2) intersects store keys on every call. With 50+ components and frequent queries, this becomes expensive. |
| **Solution** | Cache entity→archetype mappings. An archetype is the set of component types an entity possesses. Queries match against archetype signatures. Cache invalidates when components are added/removed. |
| **Unlocks** | O(1) query matching instead of O(components) intersection, batch iteration by archetype |
| **Complexity** | Mid-Long — ~300 lines. Bitmask-based archetype signatures. |
| **Dependencies** | Query DSL (1.2), component validation (2.1 — helpful but not required) |

### 3.2 Entity Pooling

| | |
|---|---|
| **Problem** | Entities are created/destroyed freely. Each destruction iterates all stores. Frequent spawn/despawn (projectiles, particles, summons) causes GC pressure. |
| **Solution** | Entity pool: destroyed entities are recycled (ID reused after a generation counter bump). Stores don't delete on recycle — they mark as inactive. Queries skip inactive entries. |
| **Unlocks** | Particle effects, projectile physics, summon spells without GC spikes |
| **Complexity** | Mid — ~150 lines. Generation counter + pool. |
| **Dependencies** | Query DSL (1.2 — to filter inactive), spatial index (1.1 — must handle recycled IDs) |

### 3.3 Dirty Flags / Change Detection ✅ DONE

| | |
|---|---|
| **Problem** | FOV runs every turn even if the player didn't move. Render runs even if nothing changed. Wasted computation. |
| **Solution** | ComponentStore tracks a dirty set per frame. Systems can check `store.isDirty(id)` or `store.hasChanges()` before running. Reset at end of turn. |
| **Unlocks** | Skip unnecessary FOV/render passes, reactive UI updates, efficient network sync (future multiplayer) |
| **Complexity** | Short — ~50 lines in ComponentStore + ~20 lines per system opt-in. |
| **Dependencies** | Generic component store (done) |

### 3.4 Render Layers & Culling

| | |
|---|---|
| **Problem** | Renderer receives the entire world. No z-ordering, no frustum culling. Everything renders every frame. |
| **Solution** | Render layers (terrain → items → entities → effects → UI overlays). Cull entities outside viewport. Only re-render layers that changed (via dirty flags). |
| **Unlocks** | Particle effects, floating damage numbers, visual overlays, large maps without frame drops |
| **Complexity** | Mid — ~200 lines in renderer refactor. |
| **Dependencies** | Dirty flags (3.3 — helpful), spatial index (1.1 — for viewport culling) |

---

## Tier 4 — Extensibility & Developer Experience

Infrastructure that improves the development workflow and enables
modding/plugin support.

### 4.1 Testing Utilities ✅ DONE

| | |
|---|---|
| **Problem** | No unit test infrastructure. Can't test a system in isolation without wiring up a full World + Map + Renderer. |
| **Solution** | Vitest + test helpers: `EntityBuilder` (fluent entity assembly), `createTestMap` (flat grid), `createMockRenderer` (no-op), `createTestContext` (TurnContext factory). |
| **Unlocks** | Unit tests for systems, regression tests for combat math, CI validation |
| **Complexity** | Short — ~100 lines of test helpers. |
| **Dependencies** | Generic component store (done), entity templates (2.2 — nice-to-have) |

### 4.2 Entity Inspector (Dev Overlay)

| | |
|---|---|
| **Problem** | No way to see entity component values at runtime without console logging. |
| **Solution** | Dev overlay panel listing all entities and their components. Click an entity to inspect. Only enabled in dev mode. |
| **Unlocks** | Faster debugging, easier content balancing, live state inspection |
| **Complexity** | Mid — ~200 lines of UI. |
| **Dependencies** | Query DSL (1.2 — to enumerate entities), component store (done) |

### 4.3 Hot-Reload for Content ✅ DONE

| | |
|---|---|
| **Problem** | Changing enemy/item templates requires a full page refresh. |
| **Solution** | Mutable content registry (`src/content/registry.ts`) with getter-based access. Content files self-register on first import and use `import.meta.hot.accept()` to re-register on HMR update. Consumers (`game.ts`, `entity.ts`) read from the registry instead of direct imports. Existing entities keep old stats (only new spawns use updated templates). |
| **Unlocks** | Rapid content iteration without restarting the game |
| **Complexity** | Short — ~40 lines of HMR wiring. |
| **Dependencies** | Entity templates (2.2 — gives a formal registry to update) |

### 4.4 Plugin / Hook Architecture

| | |
|---|---|
| **Problem** | All game logic lives in the core codebase. No extension points for mods or experimental features. |
| **Solution** | Lifecycle hooks: `onEntityCreated`, `onEntityDestroyed`, `onComponentSet`, `onTurnStart`, `onTurnEnd`. Plugins register via a manifest. |
| **Unlocks** | Modding support, experimental features without core changes, community content |
| **Complexity** | Long — ~400 lines. Hook registry + plugin loader + sandboxing. |
| **Dependencies** | System scheduler (1.3), event enhancements (2.4), entity templates (2.2) |

### 4.5 Centralized Keybinding Registry

| | |
|---|---|
| **Problem** | Two hardcoded key maps (`input.ts` and `panel-keys.ts`). No rebinding, no modifier keys, no conflict detection. |
| **Solution** | Single `KeybindingRegistry` with default bindings, player overrides persisted to localStorage, conflict detection, and modifier key support. |
| **Unlocks** | Accessibility (input remapping), complex key combos, in-game controls reference panel |
| **Complexity** | Mid — plan already exists at `docs/plans/keybinding-system.md` |
| **Dependencies** | None (standalone) |

---

## Dependency Graph

```
                    Generic Component Store (DONE)
                   /           |            \
                 /             |              \
           Spatial Index    Query DSL    Component Validation
              (1.1)          (1.2)           (2.1)
                \             / \              |
                 \           /   \             |
                  \         /     \       Entity Templates
                   \       /       \        (2.2)
                 Archetype Cache    \         |
                    (3.1)      System Scheduler
                                  (1.3)       \
                                    \       Plugin Hooks
                                     \       (4.4)
                                      \
            Dirty Flags ---- Render Layers
              (3.3)            (3.4)

  Event Enhancements (2.4) ---- standalone
  Schema Evolution (2.3) ------ standalone
  Entity Pooling (3.2) -------- needs 1.1 + 1.2
  Testing Utilities (4.1) ----- standalone (benefits from 2.2)
  Entity Inspector (4.2) ------ needs 1.2
  Hot-Reload (4.3) ------------ needs 2.2
  Keybinding Registry (4.5) --- standalone
```

## Suggested Implementation Order

A pragmatic order that maximizes value at each step:

1. ✅ **Spatial Index** (1.1) — immediate perf win, small effort
2. ✅ **Query DSL** (1.2) — makes every system cleaner
3. ✅ **Component Validation** (2.1) — tiny effort, catches bugs
4. ✅ **Dirty Flags** (3.3) — tiny effort, skips unnecessary work
5. ✅ **Entity Templates** (2.2) — data-driven entities
6. ✅ **System Scheduler** (1.3) — needed before 10+ systems
7. ✅ **Testing Utilities** (4.1) — enables CI
8. ✅ **Event Enhancements** (2.4) — needed for complex chains
9. ✅ **Serialization Evolution** (2.3) — migration infra (no migrations registered yet)
10. ✅ **Hot-Reload** (4.3) — content iteration speed
11. **Keybinding Registry** (4.5) — plan already written
12. **Archetype Cache** (3.1) — performance at scale
13. **Entity Pooling** (3.2) — for projectiles/particles
14. **Render Layers** (3.4) — for visual effects
15. **Entity Inspector** (4.2) — dev QoL
16. **Plugin Hooks** (4.4) — modding (long-term)
