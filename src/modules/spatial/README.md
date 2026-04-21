# `@pierre/ecs/modules/spatial`

Concrete `SpatialStructure` implementations. The interface itself lives
in core — see
[`docs/spatial-structure.md`](../../../docs/spatial-structure.md).

## `HashGrid2D` — integer grid (current default)

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

## Projection helpers

For games that work in continuous coordinates and index into an integer
cell grid, `@pierre/ecs/modules/spatial` also exports three pure
projection functions:

| Function | Description |
|----------|-------------|
| `cellOfPoint(x, y, cellSize)` | `Math.floor` projection of a point to its cell key. Negative coordinates project to negative cells (e.g. `cellSize=10`, `x=-1` → cell `-1`). |
| `cellsForAabb(x, y, w, h, cellSize)` | Generator yielding every cell a bounding box overlaps (inclusive of both corner cells). `w` and `h` should be non-negative. |
| `cellsForCircle(cx, cy, r, cellSize)` | Generator yielding the cells of the circle's bounding box — a coarse over-estimate suitable for broad-phase; callers narrow-phase themselves. |

These are independent of `HashGrid2D`: use them to compute cell keys for
any grid backend, and use the returned `CellKey` `{ x, y }` as an input
to `HashGrid2D.add` / `.remove` / `.cellFor`.

## Future implementations

Per the [general-purpose-ecs-roadmap](../../../../../docs/roadmap/general-purpose-ecs-roadmap.md):
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
