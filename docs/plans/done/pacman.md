# Pac-Man example (20 Games Challenge rung 12)

A tile-locked maze chase built on unmodified `@pierre/ecs`, as
[`examples/pacman`](../../../examples/pacman/). What it has to prove: movement that
is continuous but only turns at tile centres, four AI agents that share one FSM
table yet steer by different rules, and a global clock (scatter / chase) that
overrides all of them — none of which the earlier rungs exercised together.

## Goals (from the challenge page)

- [x] Maze with walls, dots, power pellets, and a tunnel that wraps
- [x] Pac-Man steered by buffered turns, eating dots and power pellets
- [x] Four ghosts, each with its own chase targeting (Blinky, Pinky, Inky, Clyde)
- [x] Scatter / chase schedule, frightened state, eaten state and the trip home
- [x] Lives, score, extra life, high score
- [x] Bonus fruit
- [x] Level progression with tightening speeds and fright time

## Build

- [x] `maze.ts` — layout, tile queries, directions; test: shape, symmetry, 244 pellets
- [x] `movement.ts` — `stepMover`: decide-at-centre movement with tunnel wrap; tests
- [x] `ghosts.ts` — chase targets and exit choice (tie-break order, no-upturn tiles); tests
- [x] `levels.ts` — speeds, fright time, schedule, release dots, scoring; tests
- [x] `game.ts` / `components.ts` — world, state, spawners, level lifecycle
- [x] `brains.ts` — ghost, scatter/chase clock and game-phase FSM tables
- [x] `systems.ts` — pac, ghosts, eat, catch (`makeTriggerSystem`), animation, HUD
- [x] `sprites.ts` / `audio.ts` — procedural sprite sheet + clips, synthesised sound
- [x] `game.test.ts` — the whole rule set driven headlessly through `TickRunner`
- [x] Registered: manifest, loader, hub dependency, lockfile workspace entry
- [x] Verified in Chromium: play, frightened, eaten, death, level rollover

## Follow-through

- [x] Gaps logged in the engine gap ledger
- [x] Challenge table ticked
- [x] `npm run docs:usage` regenerated
- [x] `vitest` include widened to `examples/*/src/**/*.test.ts` so example tests run in the gate
