# Component Store (`packages/ecs/src/component-store.ts`)

## Interfaces

- **`ComponentDef<T>`** — defines a component type: `name` (JSON key),
  optional `requires` (names of prerequisite components), `serialize`, `deserialize`.
- **`TagDef`** — defines a tag type: `name` (JSON key).

## Stores

- **`ComponentStore<T>`** — typed wrapper over `Map<EntityId, T>` with
  get/set/delete/has/entries/keys/iterator + serialization helpers.
- **`TagStore`** — typed wrapper over `Set<EntityId>` with
  add/delete/has/iterator + serialization helpers.

## Lifecycle Events (`subscribe`)

`ComponentStore` exposes a multi-observer event API. Each call to
`subscribe(event, handler)` returns an unsubscribe function.

| Event | Signature | Timing | Typical use |
|-------|-----------|--------|-------------|
| `'set'` | `(id, value) => void` | After map insertion | Spatial index update, dev inspectors |
| `'delete'` | `(id, oldValue) => void` | After map removal (including during `set()` replace) | Cleanup (e.g., spatial index removal) |
| `'validate'` | `(id) => void` | Before map insertion | Dev-mode dependency checks |

`set()` emits `validate` first, then `delete` for the old value (if
replacing), inserts, then emits `set`. Handlers run in registration order.
Multiple handlers per event are supported and independent.

```ts
const off = store.subscribe('set', (id, value) => {
  console.log('entity', id, 'got', value);
});
// later:
off();
```

`store.validate(id)` manually fires the `validate` handlers for an id — used
by `EcsWorld.spawn` to run post-spawn dependency checks once all components
are attached.

## Dirty Flags (Change Detection)

Both `ComponentStore` and `TagStore` track per-turn mutations via an internal
`dirty: Set<EntityId>`:

| Method | Returns | Description |
|--------|---------|-------------|
| `isDirty(id)` | `boolean` | Entity was set/deleted this turn |
| `hasChanges()` | `boolean` | Any entity was mutated this turn |
| `clearDirty()` | `void` | Reset (called by `World.clearAllDirty()` at end of turn) |
| `markDirty(id)` | `void` | Manually mark an entity dirty (e.g., after in-place mutation) |

`set()` / `add()` / `delete()` automatically mark the entity as dirty.
`clear()` also clears the dirty set.

`World.clearAllDirty()` iterates all registered component and tag stores and
calls `clearDirty()`. This is called at the end of each turn in
`Game.runSystems()`, after events are flushed.

### System opt-in example

```ts
if (!ctx.world.positions.isDirty(entityId)) return;
```

Skips expensive recomputation when the entity didn't change.

**Limitation:** In-place mutations to component objects (e.g.,
`component.value += x`) are not tracked — only `store.set()`,
`store.delete()`, and `store.markDirty()` set the dirty flag.
Code that mutates component data in place should call
`store.markDirty(id)` explicitly.

## Component Validation (dev-mode only)

`ComponentDef<T>` supports an optional `requires` array listing the names of
prerequisite component stores. In development builds (`import.meta.env.DEV`),
`World.registerComponent()` subscribes a `'validate'` handler that warns to
console if a prerequisite is missing when `store.set(id, value)` is called.
`EcsWorld.spawn()` additionally calls `store.validate(id)` once per spawned
component so dependency checks still fire when a template populates multiple
components in one go.

In production builds, Vite eliminates the validation wiring entirely.

## Serialization

- `store.toSerialized(def)` — returns `Array<[EntityId, serializedValue]>`
- `ComponentStore.fromSerialized(raw, label, def)` — constructs a store from
  serialized data, calling `def.deserialize` per entry.

## Adding a New Component

1. Define the interface + `ComponentDef` in `src/components/<name>.ts`
2. Register in `World`'s constructor: `this._foo = this.registerComponent(FooDef)`
3. Add a typed getter: `get foos() { return this._foo; }`

~5 lines total.
