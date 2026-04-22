# `@pierre/ecs/modules/pathfinding`

Grid-agnostic A\* pathfinding. Canon: rot.js `Path.AStar`, libtcod
`TCODPath`, Godot `AStar2D`, Bevy `bevy_pathfinding` (community).

## API

```ts
interface PathNode { x: number; y: number }

interface FindPathOptions {
  from: PathNode;
  to: PathNode;
  traversable: (x: number, y: number) => boolean;
  neighbors?: (x: number, y: number) => Iterable<PathNode>;
  cost?: (fromX: number, fromY: number, toX: number, toY: number) => number;
  heuristic?: (ax: number, ay: number, bx: number, by: number) => number;
  maxCost?: number;
}

function findPath(options: FindPathOptions): PathNode[] | null;
```

Returns waypoints **excluding** `from` and **including** `to`, or
`null` if unreachable. Empty array when `from === to`.

## Defaults

| Option | Default | Notes |
|---|---|---|
| `neighbors` | 8-directional | Yields 8 surrounding cells. |
| `cost` | `2` cardinal, `3` diagonal | Favors straight corridors over diagonal zigzags on uniform grids. |
| `heuristic` | Chebyshev with `2`/`3` weights | Admissible with the default cost; guarantees optimal paths. |
| `maxCost` | `Infinity` | Bound the search for bailout-on-huge-maps scenarios. |

## Custom cost & heuristic

If you override `cost`, also override `heuristic` to stay admissible
(`heuristic(a,b) ≤ true_cost(a,b)`). A heuristic that overestimates
produces suboptimal paths.

## 4-directional grids

```ts
findPath({
  from, to, traversable,
  neighbors: (x, y) => [{x: x-1, y}, {x: x+1, y}, {x, y: y-1}, {x, y: y+1}],
  cost: () => 1,
  heuristic: (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by),
});
```

## Weighted terrain

`cost(fromX, fromY, toX, toY)` receives both endpoints so terrain-based
cost works naturally:

```ts
cost: (_fx, _fy, tx, ty) => tileAt(tx, ty).isSwamp ? 10 : 2,
```

## Notes

- Pure function — no `EcsWorld` touch points.
- Uses string keys (`"x,y"`). Unbounded coordinates, but slower than
  bit-packed integer keys on hot loops. For grids under ~100×100 with
  per-turn re-plan (rogue AI, auto-path) this is not a bottleneck.
  A `keyEncoder` option can be added when a real consumer measures a
  win.
- The algorithm is classic A\* with a linear-scan open list. Adequate
  for rogue-scale grids; swap to a binary heap when a consumer shows
  profile evidence (~>1000 nodes regularly explored).

## Not in V1

Jump Point Search, flow fields, path smoothing, bidirectional search,
D\* Lite (incremental re-plan). All tracked in
[docs/roadmap/ecs-module-backlog.md](../../../../../docs/roadmap/ecs-module-backlog.md)
as V2 triggers.
