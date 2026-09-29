# `@pierre/ecs/modules/spatial`

Concrete `SpatialStructure` implementations. The interface itself lives
in core — see
[`spatial-structure`](../../spatial-structure.md).

## `HashGrid2D` — integer grid

`Map<"x,y", Set<EntityId>>`. Each cell key maps to the set of entities at
that integer position. Auto-maintained via
`ComponentStore.subscribe('set' | 'delete', ...)` handlers installed by
`EcsWorld.enableSpatial` on the position store when a `HashGrid2D` is passed
to it. Same-cell no-op
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
Backend-agnostic code should use `queryAt` and filter the ids it yields
instead.

Import via `@pierre/ecs/modules/spatial`.

## `HashGrid3D` — continuous 3D hash

A spatial hash over continuous `{x, y, z}` positions, implementing
`SpatialStructure<{x, y, z}>` so it plugs straight into
`world.enableSpatial(Position3DDef, …)`. `new HashGrid3D({ cellSize })`
buckets each position into the cubic cell `floor(p / cellSize)` (default
`cellSize` `1`).

- It stores a copy of each entity's position, so `queryNear` (Euclidean,
  inclusive) and `queryRect` (inclusive box) are exact rather than "shares a
  cell".
- An entity holds one position: `add` on an entity already present moves it,
  and `remove` / `move` locate the current cell from the stored copy.
- `queryAt(pos)` yields the entities in the cell containing `pos`.
- Extras: `has(id)`, `positionOf(id)`, `size`, `cellSize`.

Pick `cellSize` near your typical query radius. A query whose box spans more
cells than the grid holds entities scans the stored positions instead, so an
oversized radius stays bounded by the population.

```ts
import { EcsWorld } from '@pierre/ecs';
import { HashGrid3D } from '@pierre/ecs/modules/spatial';
import { Position3DDef } from '@pierre/ecs/modules/transform-3d';

const PickupTag = { name: 'pickup' };
const world = new EcsWorld();
world.registerComponent(Position3DDef);
world.registerTag(PickupTag);

// Only pickups are indexed; everything else with a Position3D is ignored.
const pickups = world.enableSpatial(Position3DDef, new HashGrid3D({ cellSize: 2 }), { withTag: PickupTag });

const id = world.createEntity();
world.getStore(Position3DDef).set(id, { x: 1, y: 0, z: 1 });
world.getTag(PickupTag).add(id);
world.move(Position3DDef, id, { x: 4, y: 0, z: 1 });

for (const near of pickups.queryNear({ x: 4, y: 0, z: 0 }, 1.5))
  world.queueDestroy(near);
```

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

## `makeGridSyncOnMove` — motion ↔ grid glue

When an app keeps its own `HashGrid2D` (distinct from
the one passed to `world.enableSpatial` — e.g. a bullet/enemy broadphase
grid in Asteroids or the Shooter), it needs an `onMove` callback on
`makeVelocityIntegrationSystem` to re-index entities as they cross cell
boundaries. That callback body is identical across every consumer seen
so far: project prev/next through `cellOfPoint`, call `grid.move` when
the cells differ.

`makeGridSyncOnMove({ grid, cellSize })` returns that callback:

```ts
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { HashGrid2D, makeGridSyncOnMove } from '@pierre/ecs/modules/spatial';

const grid = new HashGrid2D();
const CELL_SIZE = 64;

const motion = makeVelocityIntegrationSystem({
  name: 'movement',
  boundary: { bounds: { height: 600, width: 800 }, mode: 'wrap' },
  onMove: makeGridSyncOnMove({ cellSize: CELL_SIZE, grid }),
});
```

Spawn/despawn bookkeeping stays in app code — the helper only covers
the motion step.

## Backends — shipped and future

Shipped: `HashGrid2D` and `HashGrid3D` (above), and `ContinuousHashGrid2D` (a
continuous-space 2D grid taking a `cellSize`).

Tracked as a deferred gap (`modules/spatial` — `QuadTree` / `BVH` backends)
in the [module backlog](../../../docs/roadmap/ecs-module-backlog.md):
`QuadTree`, and `BVH` / `SweepAndPrune` for AABB sets — for consumers a uniform
grid cannot serve (very uneven entity density, or static AABB sets).

## Integration with `EcsWorld`

```ts
const grid = world.enableSpatial(PositionDef, new HashGrid2D()); // any SpatialStructure<T> for a ComponentDef<T>
const pickups = world.enableSpatial(PositionDef, new HashGrid2D(), { withTag: PickupTag });
```

- `enableSpatial` subscribes to the component's store (and, with `withTag`,
  to the tag), so adding, replacing and removing the component — or the tag —
  keeps the index in sync. Entities that already qualify are indexed at once.
- A world can hold any number of indexes: one per component, or several over
  one component split by tag. Each needs its own structure instance.
- `enableSpatial` returns the structure with its own type, so the handle
  keeps the grid-specific extras (`getAt`, `findAt`, `getInRect`). Keep it —
  in a `World` subclass field or your game state — to query the index.
- `world.move(PositionDef, id, { x, y })` moves the entity in every index on
  `PositionDef` that holds it, then writes the new value. Move indexed
  entities through `world.move()` rather than mutating positions directly.
