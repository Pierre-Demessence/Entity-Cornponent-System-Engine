# Game of Life

Conway's Game of Life on a 160×100 torus, with every live cell an entity. An
engine example, not a Life tool: no pattern editor, no unbounded plane, no
HashLife.

**Controls:** LMB paint · RMB erase · Space pause · N step · +/− speed · T cycle
rule · G trails · R random soup · C clear · 1–6 presets (glider, R-pentomino,
acorn, lightweight spaceship, pulsar, Gosper glider gun) · WASD/arrows pan ·
wheel or Q/E zoom · K save · L load.

## How a generation works

A tick is one generation. The `rules` system reads the current board through
the spatial index and only *queues* what changes — `queueSpawn` for births,
`queueDestroy` for deaths — so every cell's fate is decided from the same
generation. `TickRunner` flushes the queue after the tick: the command buffer is
the double buffer synchronous update needs, with no second board.

With trails on, a dying cell is not destroyed. It swaps its `cell` tag for
`ghost` and its age for a lifetime and an opacity, fades out, and
`modules/lifetime` removes it a few generations later.

## What it exercises

| File | Engine surface |
|---|---|
| [`defs.ts`](src/defs.ts) | a `Plugin` registering every store; an `EcsWorld` subclass holding the typed `HashGrid2D` from `enableSpatial`; `simpleComponent` (`u8` age); the cell `EntityTemplate`; `easing` + `math.lerp`/`inverseLerp` for the age palette |
| [`systems.ts`](src/systems.ts) | a phased `Scheduler`; `queueSpawn` / `queueDestroy` / `queueAdd` / `queueRemove` / `queueAddTag` / `queueRemoveTag`; `HashGrid2D.findFirstAt` neighbour counts; `math.wrap` for the torus; `makeLifetimeSystem` + `timer.fraction` + `easing` fading ghosts; an `EventBus` for `Extinct` / `Settled` |
| [`patterns.ts`](src/patterns.ts) | RLE presets as `grid-based` `Point`s |
| [`main.ts`](src/main.ts) | `TickRunner` over a `ManualTickSource`, stepped by a repeating `timer` inside an `AnimationFrameTickSource` loop; `world.lifecycle` `TagAdded` / `TagRemoved` counting births and deaths; a `.changed(AgeDef)` query recolouring only cells whose age moved; `createInput` over `KeyboardProvider` + `PointerProvider`, `bresenhamLine` brush strokes, `projectPointer` for the wheel; `camera` (`viewToWorld`, `cameraViewRect`, `clampCameraToLimits`); `Canvas2DRenderer` with `OpacityDef`, `RenderOrderDef` and a `ScreenSpaceDef` HUD; `rng` seeded soups; `spawnBatch`; `world.toJSON` / `loadJSON` through `save`'s `LocalStorageBackend` |

A cell carries three components and a tag, no more: every component is an
archetype move on each spawn and destroy, and a busy generation spawns and
destroys thousands of cells.
