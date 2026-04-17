# Query Builder (`src/ecs/query.ts`)

A fluent query builder for typed component iteration with tag filters.

## How It Works

- Constructed with an array of `ComponentStore` instances.
- Iterates the **smallest** store for intersection efficiency, then checks
  all other stores have the entity.
- `.without(tagStore)` excludes entities present in a TagStore.
- `.withTag(tagStore)` requires entities to be present in a TagStore.

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
