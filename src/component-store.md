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
- **`ColumnStore<T>`** — Structure-of-Arrays storage for all-numeric
  components, chosen automatically by `registerComponent`. It locates rows by
  the id's index and checks the full id, so a stale id (same index, older
  generation) misses on every read, and writing one while the index holds a
  newer entity throws.

Every store keys rows by the full `EntityId`, generation included, so an id
kept after its entity was destroyed never reads or writes the entity that
reused its index. Ids decoded from saves go through `asEntityId`.

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

## Change Ticks

Every store stamps each entity with the tick of its last recorded change, read
from a `ChangeClock` shared by the whole world. Queries turn those stamps into
[`added` / `changed` filters](query.md); the stamps themselves
are rarely read directly.

| Method | Returns | Description |
|--------|---------|-------------|
| `addedTick(id)` | `number` | Tick the entity gained the component or tag; `0` when absent |
| `changedTick(id)` | `number` | Tick of the last recorded change, insert included; `0` when absent (component stores only) |
| `getMut(id)` | `T \| undefined` | Read for in-place mutation, recording a change |
| `markChanged(id)` | `void` | Record a change the store cannot see (component stores only) |
| `clock` | `ChangeClock` | The stamp source; the world's clock for registered stores |

What records a change:

- `set()` — an insert stamps both added and changed; a replace stamps changed.
- `getMut(id)` — stamps on access, whether or not the caller then writes.
- A field write through a columnar store's `get(id)` view (`pos.x += 1`).
- `markChanged(id)` — for writes made through the columnar fast path
  (`column()` + `slotOf()`), which bypasses the store.
- `TagStore.add()` — stamps added when the tag was absent.

What does **not**: `get(id)` on an object-backed store, including mutating the
object it returns — use `getMut(id)` when you intend to write. `delete()` drops
the stamps rather than recording a change; removal is observed through the
world's lifecycle events.

```ts
const hp = world.getStore(HealthDef);
hp.getMut(id)!.current -= damage; // recorded
hp.get(id)!.current -= damage;    // not recorded
```

A store built outside a world creates its own clock. Pass one explicitly —
`new ComponentStore(clock)`, `new TagStore(clock)`,
`new ColumnStore(fields, { clock })` — when standalone stores are filtered by
one query.

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
