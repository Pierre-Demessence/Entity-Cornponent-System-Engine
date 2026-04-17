# Component Store (`src/ecs/component-store.ts`)

## Interfaces

- **`ComponentDef<T>`** — defines a component type: `name` (JSON key),
  optional `requires` (names of prerequisite components), `serialize`, `deserialize`.
- **`TagDef`** — defines a tag type: `name` (JSON key).

## Stores

- **`ComponentStore<T>`** — typed wrapper over `Map<EntityId, T>` with
  get/set/delete/has/entries/keys/iterator + serialization helpers.
- **`TagStore`** — typed wrapper over `Set<EntityId>` with
  add/delete/has/iterator + serialization helpers.

## Callbacks

| Callback | Timing | Purpose |
|----------|--------|---------|
| `onSet` | After map insertion | Side effects (e.g., spatial index update) |
| `onDelete` | After map removal | Cleanup (e.g., spatial index removal) |
| `onValidate` | Before map insertion | Dev-mode dependency checks |

`set()` calls `onValidate` first, then `onDelete` for the old value
(if replacing), then inserts, then `onSet`.

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
`World.registerComponent()` wires an `onValidate` callback that warns to
console if a prerequisite is missing when `store.set(id, value)` is called.

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
