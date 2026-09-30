# EcsWorld

Generic, project-agnostic ECS registry. Owns entity id allocation, component/tag
stores, the query engine entry point, template-based spawning, serialization,
and opt-in spatial indexing. It has **zero imports from consumer code** —
every component and tag is registered by the consumer after construction.

Consumer-specific behavior (typed getters, domain-specific lookups,
cross-world entity transfer) belongs in a subclass owned by the consumer,
not in this package.

## Responsibilities

- Allocate `EntityId` values, recycling destroyed entities' ids behind a
  generation counter (see [Entity ids](#entity-ids)).
- Register `ComponentDef<T>` and `TagDef` schemas and hold the backing
  `ComponentStore<T>` / `TagStore` instances.
- Expose a typed `query(...)` DSL that selects matching entities by archetype
  signature, with tag filters.
- Spawn entities from `EntityTemplate` blueprints with optional per-component
  overrides.
- Serialize to / load from a plain JSON payload.
- Opt-in spatial indexing via `enableSpatial(def, structure, options?)`: any
  number of indexes, over components of any shape (`{ x, y }`, `{ x, y, z }`,
  …), each optionally restricted to entities holding a tag.
- Suppress dev-mode `requires` validation during `spawn()` (components arrive
  in arbitrary order; full validation runs once per entity after the template
  has been fully applied).

## API

| Method | Description |
|--------|-------------|
| `createEntity()` | Create an empty entity and return its `EntityId`, possibly reusing a destroyed entity's index with a newer generation. |
| `destroyEntity(id)` | Immediately remove `id` from every store and tag it holds and free its index. A no-op unless `id` is alive, so a stale id never touches the entity now using its index. **Not safe** to call while iterating a store — use `queueDestroy` instead. |
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
| `enableSpatial(def, structure, { withTag? })` | Index the component's values in `structure` (any `SpatialStructure`, e.g. `HashGrid2D` / `HashGrid3D` from `@pierre/ecs/modules/spatial`) and keep it in sync with the store. With `withTag`, only entities that also hold the tag are indexed, following the tag's add / remove too. Entities that already qualify are indexed at once. Returns `structure` with its own type — keep it to query the index. Callable any number of times; each call needs its own structure. |
| `move(def, id, to)` | Move an indexed component to `to`: every index on `def` that holds the entity moves it, then `to`'s fields are written into the stored value and the change is stamped. No-op if the entity lacks the component; throws if `def` has no index. |
| `getColumnStore(def)` | Fast-path accessor for an all-numeric component's columnar store, exposing `column()` / `slotOf()` for zero-allocation hot loops. Throws if the component uses object storage. |
| `query(...defs)` | Build a typed `Query` over the given component defs. |
| `spawn(template, overrides?)` | Create an entity from a template, shallow-merging per-component overrides. |
| `spawnBatch(entries)` | Spawn many entities at once. Validates all at the end instead of per call. |
| `use(...plugins)` | Install one or more `Plugin`s, calling each one's `build(world)` exactly once. Plugin names must be unique per world. Returns `this`. |
| `hasPlugin(name)` | Whether a plugin with `name` has been installed. |
| `transferEntity(id, from, componentNames?)` | Copy an entity's components from another world, preserving its id (index and generation). Throws when this world's entity at that index is a different one, when the index is retired, or when it is free at a newer generation. Tags are not transferred (application-semantic). Optionally filter to a subset of components. |
| `clock` | The `ChangeClock` every registered store stamps added / changed ticks from; advanced by queries with `added` / `changed` filters. |
| `clearAll()` | Empty every component/tag store, the destroy queue, every spatial index, and the lifecycle event queue; reset id allocation so the next entity is `0`. Registrations are preserved. Silent by design — no `EntityDestroyed` storm. Useful for full world resets (level restart, new game). |
| `toJSON()` | Serialize the registry to `{ entities, [storeName]: serialized }`, where `entities` is the id-allocation state. |
| `loadJSON(data)` | In-place load — restores id allocation from `entities`, clears every registered store, then repopulates each from the payload entry of the same name. Throws on a row whose entity is not live in `entities`, and on payloads without `entities`. |
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
world.move(PosDef, id, { x: 5, y: 6 });
grid.getAt(5, 6); // Set { id }
```

## Entity ids

An `EntityId` is a number packing a 22-bit **index** (the entity's slot) and an
8-bit **generation** (how many times that slot was reused before). A fresh
world hands out `0, 1, 2, …`. Destroying an entity frees its index; the next
`createEntity` / `spawn` / `queueSpawn` reuses the most recently freed index
with the generation bumped. Ids stay below `2^30`, so they are always small
integers to the JavaScript engine.

- **Stale ids stay dead.** An id held after its entity is destroyed never
  matches the index's next occupant: `isAlive` is `false`, stores miss it,
  `destroyEntity` / `queueDestroy` / `queueAdd` / `move` through it do nothing.
- **Limits.** At most `ENTITY_INDEX_MAX + 1` (4,194,304) entities are alive
  at once. An index is retired after its 256th use rather than wrapping around,
  so the world allows about 10⁹ spawns between resets; beyond that,
  `createEntity` throws.
- **Branded type.** A plain `number` is not an `EntityId`. Ids come from the
  world (`createEntity`, `spawn`, queries, lifecycle events), from
  `packEntityId(index, generation)`, or, when decoding untrusted data, from
  `asEntityId(value, label)` / `isEntityId(value)`. An `EntityId` still reads as
  a number anywhere (arithmetic, keys, template strings).
- **Reading ids.** `entityIndex(id)` / `entityGeneration(id)` split an id;
  `formatEntityId(id)` prints it as `5v1` for logs.
- **Save/load.** `toJSON` writes the allocation state, generations of free
  indices included, so ids saved in component values keep their meaning after
  `loadJSON`: live ids resolve, stale ones stay stale, and component-less
  entities survive the round-trip.
- **`clearAll` resets allocation.** Ids held across a reset may match entities
  created after it.

## Extending for a specific consumer

The engine is designed to be subclassed. A consumer subclass typically:

1. Calls `super()` to initialize the engine.
2. Calls `this.registerComponent(...)` for every consumer component,
   storing the returned store as a typed `readonly` field.
3. Calls `this.registerTag(...)` for every consumer tag.
4. Calls `this.enableSpatial(PositionDef, backend, options?)` for each spatial
   index it needs, keeping each returned handle in a typed `readonly` field.
5. Adds consumer-specific helpers on top of the generic API.

## Invariants

- A structure backs at most one index.
- Component and tag names must be unique per world.
- Once `enableSpatial` has indexed a component, change an indexed entity's
  value only via `world.move(def, id, to)` — a direct write leaves the index
  believing the old position. A component with no index has nothing to keep
  current, and `move` throws for it; write it like any other. With `withTag`,
  entities outside the tag are not indexed, so writing their values directly
  is fine.
- `loadJSON` restores by name into the components and tags registered on the
  world, so register the same schemas (in any order) before calling it. Payload
  keys with no registered store are ignored, not an error.
- Liveness (`isAlive` / `entityCount` / `liveEntities`) is restored from the
  payload's `entities` state on `loadJSON`, so a component-less entity stays
  alive across a save/load round-trip.
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
- [Spatial Structure](spatial-structure.md) - `world.enableSpatial(def, structure)` and `world.move(def, id, to)`.
- [Tick](tick.md) - drives the game loop around the world.

