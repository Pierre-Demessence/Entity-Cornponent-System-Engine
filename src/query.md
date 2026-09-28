# Query Builder

A fluent query builder for typed component iteration with tag filters.

## How It Works

- Constructed with an array of `ComponentStore` instances.
- Built by `world.query(...)`, it selects whole archetype buckets by
  component/tag signature, so a match costs no per-entity store probing and the
  bucket list is cached until the world's archetype set changes.
- Constructed directly, with no world, it iterates the **smallest** store and
  checks every other store for the entity. Both paths yield identical results.
- `.without(tagStore)` excludes entities present in a TagStore.
- `.withTag(tagStore)` requires entities to be present in a TagStore.
- Every result is an `[EntityId, ...components]` tuple — one component per def,
  in the order the defs were passed.

## API

| Method | Returns | Description |
|--------|---------|-------------|
| `.without(...TagStore[])` | `this` | Exclude entities with tag |
| `.withTag(...TagStore[])` | `this` | Require entities with tag |
| `[Symbol.iterator]()` | yields `[EntityId, ...T]` | Lazy iteration |
| `.run()` | `Array<[EntityId, ...T]>` | Collect to array |
| `.first()` | `[EntityId, ...T] \| undefined` | First match |
| `.count()` | `number` | Count matches without allocating |

## Integration with World

`World.query()` provides typed overloads (1-4 component defs) that resolve
`ComponentDef<T>` → `ComponentStore<T>` via an internal `storeByName` map,
then construct a `QueryBuilder`.

## Example

```typescript
for (const [id, pos, stats] of world.query(PositionDef, StatsDef).without(world.inactive)) {
  // pos and stats are fully typed from the ComponentDef generics
}
```

## See also

- [Component Store](component-store.md) - the typed storage queries iterate over.
- [EcsWorld](world.md) - exposes `world.query(...)` as the main entry point.

