# Query Builder

A fluent query builder for typed component iteration with tag and component
filters.

## How It Works

- Constructed with an array of `ComponentStore` instances — the **data** columns.
  They are required, and their values are yielded in order.
- Built by `world.query(...)`, it selects whole archetype buckets by
  component/tag signature, so a match costs no per-entity store probing and the
  bucket list is cached until the world's archetype set changes.
- Constructed directly, with no world, it iterates the **smallest** mandatory
  store and checks every other filter for the entity. Both paths yield identical
  results.
- Fluent methods add filters (not yielded) or one extra yielded column:
  - `.withTag(tagStore)` — require every listed tag.
  - `.without(tagStore)` — exclude entities with any listed tag.
  - `.withComponent(store)` — require a component **without** yielding it
    (Bevy `With<T>`).
  - `.withoutComponent(store)` — exclude entities holding a component
    (Bevy `Without<T>`).
  - `.optional(store)` — append the component's value to each result tuple as
    `T | undefined`; does not filter (Bevy `Option<&T>`).
  - `.anyOf(a, b, …)` — require at least one member of the group; each call is
    one group, groups AND together (Bevy `Or`, DOTS `WithAny`). Members may be
    component or tag stores.
  - `.added(store)` / `.changed(store)` — keep only entities that gained, or
    changed, a component since this query's previous pass. See
    [Change filters](#change-filters).
- Every result is an `[EntityId, ...data, ...optional]` tuple.

## Mutating during iteration

Iterating a `world.query(...)` (the indexed path) is guarded: in DEV, a
**structural** change to a matched store mid-loop — adding/removing a component
or tag, destroying or spawning an entity — throws instead of silently skipping a
swap-removed entity. Record the change with `world.queueAdd` / `queueRemove` /
`queueAddTag` / `queueRemoveTag` / `queueDestroy` / `queueSpawn` inside the loop
and `world.flushCommands()` after it. Mutating a component's *values* (not its
presence) is safe. The guard covers the indexed `world.query` path; a standalone
`new QueryBuilder(stores)` with no index is unguarded.

## Change filters

`.added(store)` matches entities that gained the component or tag since the
query's previous pass; `.changed(store)` matches entities whose component was
inserted or changed since then (Bevy `Added<T>` / `Changed<T>`). Both imply the
store is required. Several filters AND together.

A filtered query remembers its previous pass, so **build it once and iterate it
every tick**:

```typescript
const moved = world.query(PositionDef).changed(world.getStore(PositionDef));

scheduler.add({
  name: 'sync-sprites',
  run: () => {
    for (const [id, pos] of moved) sprites.moveTo(id, pos);
  },
});
```

- A pass reports everything since *this query's* previous pass, whatever the
  system order: a writer that runs after the reader is seen on the reader's
  next pass. Two queries over the same store keep separate windows, and a query
  that is not iterated for a while catches up on its next pass.
- A new query's first pass reports every matching entity as added and changed.
  A query rebuilt every tick therefore reports everything, every tick.
- The window opens when a pass **starts**: `run()`, `count()` and `first()`
  each consume one, and a write made during the pass is reported next pass.
- What counts as a change — `set()`, `getMut()`, a columnar view write,
  `markChanged()` — is listed in the [Component Store](component-store.md) guide.
  Mutating the object returned by `get()` is not. Removal is not a change;
  observe it through the world's lifecycle events.
- All filtered stores must share one clock (one world); a query that mixes
  clocks throws when iterated.

## API

| Method | Returns | Description |
|--------|---------|-------------|
| `.withTag(...TagStore[])` | `this` | Require entities with every tag |
| `.without(...TagStore[])` | `this` | Exclude entities with any tag |
| `.withComponent(...store[])` | `this` | Require component(s), not yielded |
| `.withoutComponent(...store[])` | `this` | Exclude entities holding component(s) |
| `.optional(store)` | `QueryBuilder<[...T, O \| undefined]>` | Append optional yielded column |
| `.anyOf(...members[])` | `this` | Require one member per group (groups AND) |
| `.added(store)` | `this` | Keep entities that gained a component or tag since the previous pass |
| `.changed(store)` | `this` | Keep entities whose component changed since the previous pass |
| `[Symbol.iterator]()` | yields `[EntityId, ...T]` | Lazy iteration |
| `.run()` | `Array<[EntityId, ...T]>` | Collect to array |
| `.first()` | `[EntityId, ...T] \| undefined` | First match |
| `.count()` | `number` | Count matches without allocating |

## Integration with World

`World.query()` provides typed overloads (0–4 component defs) that resolve
`ComponentDef<T>` → `ComponentStore<T>` via an internal `storeByName` map,
then construct a `QueryBuilder`. The zero-arg `world.query()` is the entry point
for tag-only and filter-only queries (yielding `[EntityId]`). Component and tag
stores for the filter methods come from `world.getStore(def)` / `world.getTag(def)`.

## Example

```typescript
// Required Position + Stats, excluding inactive, with optional Velocity.
for (const [id, pos, stats, vel] of world
  .query(PositionDef, StatsDef)
  .without(world.getTag(InactiveTag))
  .optional(world.getStore(VelocityDef))) {
  // pos, stats fully typed; vel is Velocity | undefined
}

// Tag-only: every enemy, no component data.
for (const [id] of world.query().withTag(world.getTag(EnemyTag))) {
  // ...
}
```

## See also

- [Component Store](component-store.md) - the typed storage queries iterate over.
- [EcsWorld](world.md) - exposes `world.query(...)` as the main entry point.

