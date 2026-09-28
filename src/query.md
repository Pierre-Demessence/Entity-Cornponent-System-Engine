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
- Every result is an `[EntityId, ...data, ...optional]` tuple.

## API

| Method | Returns | Description |
|--------|---------|-------------|
| `.withTag(...TagStore[])` | `this` | Require entities with every tag |
| `.without(...TagStore[])` | `this` | Exclude entities with any tag |
| `.withComponent(...store[])` | `this` | Require component(s), not yielded |
| `.withoutComponent(...store[])` | `this` | Exclude entities holding component(s) |
| `.optional(store)` | `QueryBuilder<[...T, O \| undefined]>` | Append optional yielded column |
| `.anyOf(...members[])` | `this` | Require one member per group (groups AND) |
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

