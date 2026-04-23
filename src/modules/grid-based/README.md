# @pierre/ecs/modules/grid-based

Grid and tile-based spatial primitives. V1 ships line-of-sight and
field-of-view helpers.

Canon: roguelike FOV toolkits (libtcod, rot.js) and common engine LOS
queries (Unity ray checks, Godot ray casts).

## API

```ts
interface Point { x: number; y: number; }

interface VisibilityGrid {
  blocksSight(x: number, y: number): boolean;
  isInBounds(x: number, y: number): boolean;
}

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Point[];

function hasLineOfSight(
  grid: VisibilityGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): boolean;

function computeFieldOfView(
  grid: VisibilityGrid,
  originX: number,
  originY: number,
  radius: number,
): Point[];
```

## Behavior

- hasLineOfSight checks only intermediate tiles for blocking.
  Origin and destination do not block the result.
- computeFieldOfView uses recursive shadowcasting across 8 octants.
- computeFieldOfView returns visible coordinates including the origin
  when origin is in bounds.

## Notes

- The module is map-agnostic: callers provide blocksSight and isInBounds.
- computeFieldOfView does not mutate map state. Consumers decide how to
  apply visibility (visible flags, explored mask, heatmaps, etc.).
