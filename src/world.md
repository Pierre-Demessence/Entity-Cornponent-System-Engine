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
- Expose a typed `query(...)` DSL that selects matching entities by archetype
  signature, with tag filters.
- Spawn entities from `EntityTemplate` blueprints with optional per-component
  overrides.
- Serialize to / load from a plain JSON payload.
- Opt-in spatial indexing via `enableSpatial(def, structure)` for a `{ x, y }` component.
- Suppress dev-mode `requires` validation during `spawn()` (components arrive
  in arbitrary order; full validation runs once per entity after the template
  has been fully applied).

## API

| Method | Description |
|--------|-------------|
| `createEntity()` | Allocate a new `EntityId`. |
| `destroyEntity(id)` | Immediately remove `id` from every registered store and tag. **Not safe** to call while iterating a store — use `queueDestroy` instead. |
| `queueDestroy(id)` | Enqueue `id` for destruction on the next `flushCommands()` call. Deduped per flush; safe to call during iteration. |
| `queueSpawn(template?, overrides?)` | Reserve an id now and enqueue its creation (+ optional template population) for the next `flushCommands()`. Returns the id so it can be referenced by other queued commands in the same loop. |
| `queueAdd(def, id, value)` | Enqueue a component add for the next `flushCommands()`. Throws now if `def` is unregistered. |
| `queueRemove(def, id)` | Enqueue a component remove for the next `flushCommands()`. |
| `queueAddTag(def, id)` / `queueRemoveTag(def, id)` | Tag equivalents. |
| `flushCommands()` | Apply every queued structural change (spawn / destroy / add / remove / add-tag / remove-tag) in insertion order. Call once per tick, after systems finish iterating. |
| `isAlive(id)` | Whether `id` refers to a live entity (created and not yet destroyed). |
| `entityCount()` | Number of live entities. |
| `liveEntities()` | Iterate the live entity ids (order unspecified). |
| `endOfTick()` | End-of-tick convenience: runs `flushCommands()` then `lifecycle.flush()` so subscribers see the final entity set in one pass. Prefer over calling both manually. (`TickRunner` already does this internally.) |
| `registerComponent(def)` | Register a `ComponentDef<T>`; returns the store. Throws on duplicate name. |
| `registerTag(def)` | Register a `TagDef`; returns the store. Throws on duplicate name. |
| `getStore(def)` | Typed store lookup by def (throws if unregistered). |
| `getStoreByName(name)` | Untyped store lookup by string name. |
| `getTag(def)` / `getTagByName(name)` | Tag-store equivalents. |
| `enableSpatial(def, structure)` | Index the given component in `structure` (any `SpatialStructure`, e.g. `HashGrid2D` from `@pierre/ecs/modules/spatial`) by subscribing `set` / `delete` handlers on its store. Returns `structure` with its own type, so backend extras stay typed on the handle. May be called at most once; a second call throws. |
| `spatial` | The structure passed to `enableSpatial`, typed as the `SpatialStructure` contract (`queryAt`, `queryNear`, `queryRect`, …). A subclass may narrow the getter to its concrete backend. |
| `move(id, x, y)` | Atomically update the spatial component and the index. Throws unless `enableSpatial` has been called. |
| `getColumnStore(def)` | Fast-path accessor for an all-numeric component's columnar store, exposing `column()` / `slotOf()` for zero-allocation hot loops. Throws if the component uses object storage. |
| `query(...defs)` | Build a typed `QueryBuilder` over the given component defs. |
| `spawn(template, overrides?)` | Create an entity from a template, shallow-merging per-component overrides. |
| `spawnBatch(entries)` | Spawn many entities at once. Validates all at the end instead of per call. |
| `use(...plugins)` | Install one or more `Plugin`s, calling each one's `build(world)` exactly once. Plugin names must be unique per world. Returns `this`. |
| `hasPlugin(name)` | Whether a plugin with `name` has been installed. |
| `transferEntity(id, from, componentNames?)` | Copy an entity's components from another world, preserving its id. Tags are not transferred (application-semantic). Optionally filter to a subset of components. |
| `clock` | The `ChangeClock` every registered store stamps added / changed ticks from; advanced by queries with `added` / `changed` filters. |
| `clearAll()` | Empty every component/tag store, the destroy queue, the spatial index (if enabled), and the lifecycle event queue; reset `nextId = 0`. Registrations are preserved. Silent by design — no `EntityDestroyed` storm. Useful for full world resets (level restart, new game). |
| `toJSON()` | Serialize the registry to `{ nextId, [storeName]: serialized }`. |
| `loadJSON(data)` | In-place load — clears every registered store, then repopulates each from the payload entry of the same name. |
| `lifecycle` | `EventBus<LifecycleEvent>` — emits `EntityCreated`, `EntityDestroyed`, `ComponentAdded`, `ComponentRemoved`, `TagAdded`, `TagRemoved`. Queue-based; call `lifecycle.flush()` to dispatch (typically once per tick). An event is only built while its type has a subscriber, so a handler sees only changes made after it subscribed, and an unobserved world allocates nothing per mutation. `destroyEntity` on an id that is already dead emits nothing. Subscribers are **not** preserved across world swaps. |

## Using the engine

```ts
import { simpleComponent } from '@pierre/ecs/component-store';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';
import { EcsWorld } from '@pierre/ecs/world';

interface Pos { x: number; y: number }
const PosDef = simpleComponent<Pos>('pos', { x: 'number', y: 'number' });

const world = new EcsWorld();
const positions = world.registerComponent(PosDef);
const grid = world.enableSpatial(PosDef, new HashGrid2D());

const id = world.spawn({ name: 'marker', components: { pos: { x: 3, y: 4 } } });
world.move(id, 5, 6);
grid.getAt(5, 6); // Set { id }
```

## Extending for a specific consumer

The engine is designed to be subclassed. A consumer subclass typically:

1. Calls `super()` to initialize the engine.
2. Calls `this.registerComponent(...)` for every consumer component,
   storing the returned store as a typed `readonly` field.
3. Calls `this.registerTag(...)` for every consumer tag.
4. Calls `this.enableSpatial(PositionDef, backend)` once (if the consumer
   uses a spatial component), keeping the returned handle in a field — and
   optionally narrowing `get spatial()` to its concrete type.
5. Adds consumer-specific helpers on top of the generic API.

## Invariants

- `enableSpatial` may only be called once per world.
- Component and tag names must be unique per world.
- Once `enableSpatial` has indexed a component, change that component's `x` /
  `y` only via `world.move(id, x, y)` — a direct write leaves the index
  believing the old position. Without `enableSpatial` there is no index to keep
  current, and `move` throws; write the component like any other.
- `loadJSON` restores by name into the components and tags registered on the
  world, so register the same schemas (in any order) before calling it. Payload
  keys with no registered store are ignored, not an error.
- Liveness (`isAlive` / `entityCount` / `liveEntities`) is derived from
  persisted membership on `loadJSON`: a component-less entity carries no
  serialized data, so it is not alive after a save/load round-trip.
- Inside an `EntityDestroyed` lifecycle handler the entity is already gone —
  `isAlive(id)` is `false` and its stores no longer hold it.
- **Do not mutate a store's structure (add/remove a component or tag, destroy or
  spawn an entity) while iterating a `world.query(...)`** — a swap-removed entity
  would be silently skipped. In DEV this throws; the fix is to record the change
  with `queueAdd` / `queueRemove` / `queueAddTag` / `queueRemoveTag` /
  `queueDestroy` / `queueSpawn` inside the loop and `flushCommands()` after it.
  Mutating a component's *values* (not its presence) during iteration is safe.

## See also

- [Component Store](component-store.md) - typed storage registered on the world.
- [Query Builder](query.md) - `world.query(...)` entry point.
- [Entity Templates](template.md) - `world.spawn(template, overrides)`.
- [Spatial Structure](spatial-structure.md) - `world.enableSpatial(def, structure)` and `world.move(id, x, y)`.
- [Tick](tick.md) - drives the game loop around the world.

