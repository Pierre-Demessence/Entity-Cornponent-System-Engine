# Roguelike dungeon crawler example

A small turn-based dungeon crawler under `examples/roguelike/`, picked by the
[next-examples coverage audit](../../audit/next-examples-coverage.md) as the
largest single coverage win: it is the first example to reach `grid-based`,
`pathfinding`, `turn-based`, `noise`, `save`, `scene-transition`, and
`composeTemplates`.

An example, not a finished game: no balance pass, no polish beyond legibility.

## Shape

- **Level** — seeded rooms-and-corridors on a 48×32 grid (`rng.makeSeededRng`,
  `randomInt`, `shuffle`); `noise.fbm2D` erodes room edges into cave-like
  walls, `simplex2D` picks floor variants. Map data is plain arrays, not
  entities; the map is baked once to an offscreen canvas.
- **Turns** — every actor carries an `actor` tag; `TurnCycler` rotates the
  `activeTurn` tag across them. Player turn waits for input; monster turns
  resolve immediately until the turn comes back to the player.
- **Vision** — `computeFieldOfView` from the player each turn; explored mask
  for fog of war; monsters outside FOV are hidden. Monsters notice the player
  with `hasLineOfSight`.
- **AI** — one shared `behavior-tree`: archers shoot along a `bresenhamLine`
  when in range and not adjacent (`inverter`), everyone melees when adjacent,
  chases by `findPath` (4-way) when hunting, else wanders.
- **Monsters** — `composeTemplates(base, race, archetype[, elite])`, spawned
  with `world.spawn`.
- **Floors** — stepping on the stairs queues a `SceneTransitionQueue`
  transition applied at the frame boundary: a fresh world, and
  `transferEntities` carries the player across.
- **Save / load** — `K` saves the world (`world.toJSON()`) plus depth / seed /
  explored mask through `IndexedDBBackend` (fallback `LocalStorageBackend`);
  `L` loads, running the blob through a `MigrationRegistry`.
- **Rendering** — `Canvas2DRenderer` + `camera` follow; `tween` + `easing`
  slide actors between cells; HUD as `ScreenSpaceDef` text entities.

## Checklist

- [x] Example scaffold (`package.json`, `index.html`, Vite config, tsconfig)
- [x] Level generation + bake + FOV/fog
- [x] Components, templates, spawn
- [x] Turn loop with `TurnCycler`, player move/attack/potions
- [x] Behavior-tree AI with pathfinding, LOS, ranged attacks
- [x] Descend via scene transition + `transferEntities`
- [x] Save / load with migrations
- [x] Register in manifest, loaders, hub; example README
- [x] Log engine gaps in the ledger
- [x] Regenerate `docs:usage`; lint, typecheck, tests green
