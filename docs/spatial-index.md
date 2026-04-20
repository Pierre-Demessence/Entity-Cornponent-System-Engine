# Spatial Index (`packages/ecs/src/spatial.ts`)

A hash grid that enables O(1) position lookups instead of O(n) full scans.

## How It Works

- `Map<"x,y", Set<EntityId>>` — each cell key maps to the set of entities
  at that position.
- Auto-maintained via `ComponentStore.subscribe('set' | 'delete', ...)`
  handlers installed by `EcsWorld.enableSpatial` on the position store.
- Supports atomic `move(id, oldX, oldY, newX, newY)` with same-cell no-op
  optimization.

## API

| Method | Description |
|--------|-------------|
| `getAt(x, y)` | All entity IDs at a position (O(1)) |
| `findAt(x, y, pred)` | Every entity at `(x, y)` for which `pred(id)` returns true. Empty array when the cell is empty or no entity matches. |
| `findFirstAt(x, y, pred)` | First entity at `(x, y)` matching `pred`, or `undefined`. |
| `getInRect(x1, y1, x2, y2)` | Entities in a rectangular area |
| `add(id, x, y)` | Register entity at position |
| `remove(id, x, y)` | Unregister entity from position |
| `move(id, oldX, oldY, newX, newY)` | Atomic position update |
| `clear()` | Remove all entries |

The `findAt` / `findFirstAt` predicates are application-defined — they're
the extension point for tag/component-based queries like "blocker at",
"item at", "pickable at". The index itself stays domain-neutral.

## Integration with World

`World.move(id, x, y)` atomically updates both the position component
and the spatial index. Game code should always use `world.move()` instead
of directly mutating position components.

World's spatial-aware query helpers (e.g., filtering by tags at a
position) use `spatial.getAt(x, y)` internally.
