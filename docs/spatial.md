# Spatial

Spatial indexing is a two-layer design: a **core interface** describing the
minimum contract every spatial backend satisfies, and **module implementations**
that plug in backend-specific storage.

## Core Interface (`packages/ecs/src/spatial-structure.ts`)

```ts
interface SpatialStructure<TPos> {
  add(id: EntityId, pos: TPos): void;
  remove(id: EntityId, pos: TPos): void;
  move(id: EntityId, from: TPos, to: TPos): void;
  queryAt(pos: TPos): Iterable<EntityId>;
  queryRect(min: TPos, max: TPos): Iterable<EntityId>;
  queryNear(pos: TPos, radius: number): Iterable<EntityId>;
  clear(): void;
}
```

Query methods return `Iterable<EntityId>` (never `Set` or `Array`). Lazy
backends (quadtree, R-tree, BVH) can yield entities without materializing
intermediate collections. Consumers that need `Set` semantics call
`new Set(queryAt(pos))` explicitly — no assumption about storage leaks
into the contract.

`TPos` is the position shape: `{x, y}` for 2D, `{x, y, z}` for 3D,
`{min, max}` for AABBs, etc. Pick it to match what your backend indexes.

Import via `@pierre/ecs/spatial-structure`.

## Implementations (`packages/ecs/src/modules/spatial/`)

### `HashGrid2D` — integer grid (current default)

`Map<"x,y", Set<EntityId>>`. Each cell key maps to the set of entities at
that integer position. Auto-maintained via
`ComponentStore.subscribe('set' | 'delete', ...)` handlers installed by
`EcsWorld.enableSpatial` on the position store. Same-cell no-op
optimization on `move`.

Implements `SpatialStructure<{x, y}>` and adds grid-specific ergonomics:

| Method | Notes |
|---|---|
| `getAt(x, y)` | Returns `ReadonlySet<EntityId> \| undefined` directly — zero-alloc `.has()` / `.size`. Grid-specific. |
| `findAt(x, y, pred)` | Every entity at `(x, y)` for which `pred(id)` returns true. Empty array when nothing matches. |
| `findFirstAt(x, y, pred)` | First matching entity, or `undefined`. |
| `getInRect(x1, y1, x2, y2)` | Array form of `queryRect`. |
| `add(id, x, y)` / `add(id, pos)` | Dual signature — integer shorthand or interface-shaped Pos. |
| `remove(id, x, y)` / `remove(id, pos)` | Same. |
| `move(id, ox, oy, nx, ny)` / `move(id, from, to)` | Same. |

Convenience extras like `findAt` / `findFirstAt` stay on the
implementation because they exploit the `Set`-per-cell structure.
Backend-agnostic code should use `queryAt` and filter via the engine-level
`world.findFirst` / `world.findAll` helpers instead.

Import via `@pierre/ecs/modules/spatial`.

### Future implementations

Per the [general-purpose-ecs-roadmap](../../../docs/roadmap/general-purpose-ecs-roadmap.md):
continuous-space `HashGrid2D` with cell-size parameter, `QuadTree`,
`Octree`, `SweepAndPrune` / `BVH` for AABBs. None are in scope until a
real driver (e.g. an Asteroids/platformer prototype) forces them.

## Integration with `EcsWorld`

```ts
world.enableSpatial(PositionDef);               // defaults to new HashGrid2D()
world.enableSpatial(PositionDef, customBackend); // swap in any SpatialStructure<{x,y}>
```

- `enableSpatial` installs `set`/`delete` subscribers on the position
  store, so writes automatically keep the index in sync.
- `world.spatial` is typed as `HashGrid2D` (the default backend) so game
  code can use the grid-specific extras. If you pass a non-grid backend,
  expose it via a subclass getter with the appropriate type.
- `world.move(id, x, y)` atomically updates both the position component
  and the spatial index via the interface. Game code should always use
  `world.move()` rather than mutating positions directly.

## Why an interface?

- **Pay for what you use.** Games on a grid keep the zero-overhead
  `HashGrid2D`. Games with continuous positions swap in `QuadTree`
  without touching any system code.
- **Testability.** Mock `SpatialStructure<TPos>` implementations isolate
  the rest of the engine in tests.
- **Pluggability.** Plugins or mods can ship alternative indexing
  strategies (e.g. multi-resolution pyramids for large worlds) without
  forking the engine.
