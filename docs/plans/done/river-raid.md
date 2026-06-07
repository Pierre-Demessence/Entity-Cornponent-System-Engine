# River Raid — 20 Games Challenge #7

Atari 2600 (1982). Jet fighter flying up a procedurally-generated river,
shooting enemies, bridges, and fuel depots while managing fuel.

## Game Design

- **Scroll:** The river scrolls vertically downward past the player's jet,
  which stays at a fixed screen Y. `scrollSpeed` is controlled by
  accelerate/brake input.
- **River banks:** Procedurally generated with variable width. Banks can
  narrow or split. Hitting a bank kills the player.
- **Enemies:** Boats (move across river), helicopters (hover side-to-side),
  jets (cross entire screen). Collision = death.
- **Fuel:** Drains over time. Fuel depots refill on flyover. Depots can be
  shot (score bonus) but don't kill on collision.
- **Levels:** Between levels the river narrows to a bridge. Bridges are
  checkpoints — must be shot (collision = death).
- **Shooting:** Player fires bullets upward. Bullets destroy enemies,
  bridges, and fuel depots, scoring points.
- **UI:** Lives, score, fuel gauge.

## Stretch Goals

- [ ] Procedural level generation (the fun way — infinite, seeded)
- [ ] Particle effect explosions

## Subtasks

- [x] 1. Scaffold `examples/river-raid/` (package.json, tsconfig, vite.config, index.html)
- [x] 2. `components.ts` — Position, Velocity, Size, Enemy, Bullet, FuelDepot, Bridge, RiverBank, tags
- [x] 3. `game.ts` — GameState type, world factory, segment generation, spawn helpers, scoring
- [x] 4. `systems.ts` — input, cooldown, scroll, spawn, motion, collision, fuel
- [x] 5. `render.ts` — canvas2d drawing: river, banks, player jet, enemies, bullets, depots, bridges, UI overlay
- [x] 6. `main.ts` — wire-up: keyboard, tick runner, render tick, teardown
- [x] 7. Register in `examples/hub/src/main.ts`
- [x] 8. Build validation (tsc + vite build)
