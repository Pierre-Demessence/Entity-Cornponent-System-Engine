# Roguelike

A small turn-based dungeon crawl on generated floors. An engine example, not a
finished game: no balance, just enough rules to exercise the grid and turn
modules.

**Controls:** arrows / WASD move and attack · Space wait · Q drink a potion ·
K save · L load · R new run. Step on the grate to go down a floor.

## What it exercises

| File | Engine surface |
|---|---|
| [`level.ts`](src/level.ts) | `rng` (`makeSeededRng`, `randomInt`, `shuffle`) rooms and corridors; `noise` (`fbm2D` edge erosion, `simplex2D` floor variants); `grid-based.computeFieldOfView` for vision and fog of war |
| [`defs.ts`](src/defs.ts) | `composeTemplates` layering base creature + race + archetype (+ elite) into monster templates |
| [`ai.ts`](src/ai.ts) | one shared `behavior-tree` (`selector`, `sequence`, `condition`, `inverter`, `action`); `hasLineOfSight` to notice the player; 4-way `findPath` to chase |
| [`rules.ts`](src/rules.ts) | `bresenhamLine` for ranged shots; `tween` + `easing` + `math.pingPong` for slides and attack bumps |
| [`save.ts`](src/save.ts) | `save`: `IndexedDBBackend` (fallback `LocalStorageBackend`), checksummed envelopes, orphan recovery, `MigrationRegistry` |
| [`main.ts`](src/main.ts) | `TurnCycler` over every actor; `SceneTransitionQueue` + `transferEntities` between floors; `createEventInput` (one keypress, one turn); `camera` follow and `cameraViewRect` fog culling; `ScreenSpaceDef` HUD |

A save stores only the seed, the depth, the explored mask and `world.toJSON()`;
the map is regenerated from `(seed, depth)` on load.

Art: [Kenney Tiny Dungeon](../assets/kenney_tiny-dungeon/) (CC0).
