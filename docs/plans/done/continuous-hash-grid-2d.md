# ContinuousHashGrid2D

Plan for the `ContinuousHashGrid2D(cellSize)` backlog item.

## Gap

`HashGrid2D` keys on integer cell coordinates. Consumers with continuous
positions (asteroids, platformer, top-down-shooter) all hand-roll the
same pattern: `cellOfPoint(pos, CELL_SIZE)` → `grid.add(id, cx, cy)`.

The engine already ships the building blocks (`cellOfPoint`,
`cellsForAabb`, `cellsForCircle`, `makeGridSyncOnMove`) but there's no
single class that composes them.

## Design

A thin wrapper around `HashGrid2D` that owns a `cellSize` and projects
continuous `{x, y}` positions to integer cells internally.

```ts
class ContinuousHashGrid2D {
  constructor(cellSize: number);
  readonly cellSize: number;
  readonly grid: HashGrid2D;  // the underlying integer grid

  // Continuous-position methods (project through cellOfPoint)
  add(id, x, y): void;
  remove(id, x, y): void;
  move(id, fromX, fromY, toX, toY): void;

  // Query methods accept continuous coords + project cell ranges
  queryAt(x, y): Iterable<EntityId>;
  queryRect(minX, minY, maxX, maxY): Iterable<EntityId>;
  queryNear(x, y, radius): Iterable<EntityId>;

  // Grid-specific extras (delegate to HashGrid2D with projection)
  getAt(x, y): ReadonlySet<EntityId> | undefined;
  findAt(x, y, predicate): EntityId[];
  findFirstAt(x, y, predicate): EntityId | undefined;
  getInRect(x1, y1, x2, y2): EntityId[];

  clear(): void;
}
```

## Subtasks

- [x] Create `ContinuousHashGrid2D` class in `src/modules/spatial/`
- [x] Unit tests
- [x] Export from spatial barrel + regenerate API doc
- [x] Migrate asteroids: replace local `cellOf` + manual `grid.add`/`grid.remove`
- [x] Migrate platformer: replace local `cellsForAabb` wrapper + manual grid calls
- [x] Migrate top-down-shooter: replace local `cellOf` + manual `grid.add`/`grid.remove`
- [x] Typecheck + lint + test — all green
- [x] Update ledger row to RESOLVED
