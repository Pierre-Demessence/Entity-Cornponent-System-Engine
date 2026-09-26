# EcsWorld

Generic, project-agnostic ECS registry. Owns entity id allocation, component/tag
stores, the query engine entry point, template-based spawning, serialization,
and opt-in spatial indexing. It has **zero imports from consumer code** —
every component and tag is registered by the consumer after construction.

Consumer-specific behavior (typed getters, domain-specific lookups,
cross-world entity transfer) belongs in a subclass owned by the consumer,
not in this package.

## Responsibilities

- Allocate monotonically increasing `EntityId` values.
- Register `ComponentDef<T>` and `TagDef` schemas and hold the backing
  `ComponentStore<T>` / `TagStore` instances.
- Expose a typed `query(...)` DSL that iterates the smallest matching store.
- Spawn entities from `EntityTemplate` blueprints with optional per-component
  overrides.
- Serialize to / load from a plain JSON payload.
- Opt-in spatial indexing via `enableSpatial(def)` for a `{ x, y }` component.
- Suppress dev-mode `requires` validation during `spawn()` (components arrive
  in arbitrary order; full validation runs once per entity after the template
  has been fully applied).

## API

| Method | Description |
|--------|-------------|
| `createEntity()` | Allocate a new `EntityId`. |
| `destroyEntity(id)` | Immediately remove `id` from every registered store and tag. **Not safe** to call while iterating a store — use `queueDestroy` instead. |
| `queueDestroy(id)` | Enqueue `id` for destruction on the next `flushDestroys()` call. Deduped; safe to call repeatedly. |
| `flushDestroys()` | Drain the destroy queue, calling `destroyEntity` on each id. Call this once per tick, after systems finish iterating. |
| `endOfTick()` | End-of-tick convenience: runs `flushDestroys()` then `lifecycle.flush()` so subscribers see the final entity set in one pass. Prefer over calling both manually. (`TickRunner` already does this internally.) |
| `registerComponent(def)` | Register a `ComponentDef<T>`; returns the store. Throws on duplicate name. |
| `registerTag(def)` | Register a `TagDef`; returns the store. Throws on duplicate name. |
| `getStore(def)` | Typed store lookup by def (throws if unregistered). |
| `getStoreByName(name)` | Untyped store lookup by string name. |
| `getTag(def)` / `getTagByName(name)` | Tag-store equivalents. |
| `enableSpatial(def)` | Subscribe `set` / `delete` handlers on the given component so the `SpatialIndex` stays in sync. May be called at most once. |
| `move(id, x, y)` | Atomically update the spatial component and the index. Requires `enableSpatial` to have been called. |
| `query(...defs)` | Build a typed `QueryBuilder` over the given component defs. |
| `spawn(template, overrides?)` | Create an entity from a template, shallow-merging per-component overrides. |
| `spawnBatch(entries)` | Spawn many entities at once. Validates all at the end instead of per call. |
| `transferEntity(id, from, componentNames?)` | Copy an entity's components from another world, preserving its id. Tags are not transferred (application-semantic). Optionally filter to a subset of components. |
| `clearAllDirty()` | Clear dirty flags on every component and tag store. |
| `clearAll()` | Empty every component/tag store, the destroy queue, the spatial index (if enabled), and the lifecycle event queue; reset `nextId = 0`. Registrations are preserved. Silent by design — no `EntityDestroyed` storm. Useful for full world resets (level restart, new game). |
| `toJSON()` | Serialize the registry to `{ nextId, [storeName]: serialized }`. |
| `loadJSON(data)` | In-place load — clears existing stores then repopulates. |
| `lifecycle` | `EventBus<LifecycleEvent>` — emits `EntityCreated`, `EntityDestroyed`, `ComponentAdded`, `ComponentRemoved`. Queue-based; call `lifecycle.flush()` to dispatch (typically once per tick). Subscribers are **not** preserved across world swaps. |

## Using the engine

```ts
import { EcsWorld } from '@pierre/ecs/world';
import type { ComponentDef } from '@pierre/ecs/component-store';

interface Pos { x: number; y: number }

const PosDef: ComponentDef<Pos> = {
  name: 'pos',
  serialize: v => v,
  deserialize: raw => raw as Pos,
};

const world = new EcsWorld();
const positions = world.registerComponent(PosDef);
world.enableSpatial(PosDef);

const id = world.spawn({ name: 'marker', components: { pos: { x: 3, y: 4 } } });
world.move(id, 5, 6);
world.spatial.getAt(5, 6); // Set { id }
```

## Extending for a specific consumer

The engine is designed to be subclassed. A consumer subclass typically:

1. Calls `super()` to initialize the engine.
2. Calls `this.registerComponent(...)` for every consumer component,
   storing the returned store as a typed `readonly` field.
3. Calls `this.registerTag(...)` for every consumer tag.
4. Calls `this.enableSpatial(PositionDef)` once (if the consumer uses a
   spatial component).
5. Adds consumer-specific helpers on top of the generic API.

## Invariants

- `enableSpatial` may only be called once per world.
- Component and tag names must be unique per world.
- Entity positions must only be changed via `world.move(id, x, y)` — never
  by mutating the position component directly, or the spatial index becomes
  stale.
- `toJSON` / `loadJSON` preserve registration order of components and tags;
  the caller is responsible for registering the same schemas (in any order)
  before calling `loadJSON`.

## See also

- [Component Store](component-store.md) - typed storage registered on the world.
- [Query Builder](query.md) - `world.query(...)` entry point.
- [Entity Templates](template.md) - `world.spawn(template, overrides)`.
- [Spatial Structure](spatial-structure.md) - `world.enableSpatial(def)` and `world.move(id, x, y)`.
- [Tick](tick.md) - drives the game loop around the world.

