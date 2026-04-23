# Component Store

## Interfaces

- **`ComponentDef<T>`** — defines a component type: `name` (JSON key),
  optional `requires` (names of prerequisite components), `serialize`,
  `deserialize`, optional `version` + `migrations` (see below).
- **`TagDef`** — defines a tag type: `name` (JSON key).

## Stores

- **`ComponentStore<T>`** — typed wrapper over `Map<EntityId, T>` with
  get/set/delete/has/entries/keys/iterator + serialization helpers.
- **`TagStore`** — typed wrapper over `Set<EntityId>` with
  add/delete/has/iterator + serialization helpers.

## `simpleComponent<T>` — declarative factory for flat primitive schemas

For components whose every field is a `number`, `boolean`, or `string`,
use `simpleComponent` instead of hand-writing `serialize` / `deserialize`:

```ts
import { simpleComponent } from '@pierre/ecs';

interface Position { x: number; y: number }
export const PositionDef = simpleComponent<Position>(
  'position',
  { x: 'number', y: 'number' },
);
```

The helper auto-generates a `serialize` that shallow-copies the declared
fields and a `deserialize` that validates each field via the matching
`asNumber` / `asBoolean` / `asString` helper with labeled error paths.
Extra fields are ignored on both sides (strict to the schema).

`requires`, `version`, and `migrations` pass through via an optional third
argument:

```ts
simpleComponent<Hp>('hp', { cur: 'number', max: 'number' }, {
  requires: ['position'],
  version: 2,
  migrations: { 0: legacyV0toV1, 1: legacyV1toV2 },
});
```

Components with nested objects, arrays, enum narrowing, or any custom
validation logic continue to be written by hand.

## `registryComponent` — factory for registry-backed references

For the common pattern where a component stores a value resolved from a
registry (card defs, enemy archetypes, ability defs), use
`registryComponent`.

Default generated shape:

- Component field: `{ def: TValue }`
- Serialized payload: `{ id: string }`

```ts
import { registryComponent } from '@pierre/ecs';

interface CardDef { id: string; name: string }
interface Card { def: CardDef }

const CardDefComp = registryComponent<CardDef, string>('card', {
  lookup: getCardDef,
  selectId: def => def.id,
});
```

During deserialize, the helper validates the id (`string` by default),
resolves through `lookup`, and throws a labeled error when the id is not
registered. During serialize, it writes `{ id: selectId(value.def) }`.

You can customize field names and id kind:

```ts
const EnemyComp = registryComponent<EnemyDef, number, 'archetype'>('enemy', {
  idKey: 'defId',
  idKind: 'number',
  lookup: getEnemyDef,
  selectId: def => def.key,
  valueKey: 'archetype',
});
```

Like `simpleComponent`, optional `requires`, `version`, and `migrations`
pass through to the generated `ComponentDef`.

## Schema Evolution

A `ComponentDef<T>` may declare a `version: number` (default `0`) and a
`migrations: Record<fromVersion, (raw, label) => raw>` map. When a
versioned def serializes, its payload is wrapped as
`{ version, entries: [[id, value], ...] }`. On load, the store reads
the saved version and applies `migrations[saved]`, `migrations[saved+1]`,
... up to `def.version` before `def.deserialize`.

Unversioned defs (no `version`, or `version === 0`) keep the legacy
`[[id, value], ...]` array shape for backward compatibility. Legacy
saves can be migrated by bumping the def to `version: 1` and supplying
a `migrations[0]`.

A missing migration step throws at load time with a clear error. A
saved version newer than `def.version` also throws — downgrades are
not supported.

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

1. Define the interface + `ComponentDef<T>` in your consumer code.
2. Call `world.registerComponent(FooDef)` during world construction and
   keep the returned store as a typed field.
3. (Optional) expose a typed getter if you subclass `EcsWorld`:
   `get foos() { return this._foo; }`.

~5 lines total.

## See also

- [Query Builder](query.md) - iterate components with tag filters.
- [Entity Templates](template.md) - declarative blueprints that write into stores.
- [EcsWorld](world.md) - registers stores and owns their lifecycle.
