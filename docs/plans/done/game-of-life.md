# Game of Life example

Conway's Game of Life under `examples/game-of-life/`, built with every live cell
as an entity so the simulation leans on the engine rather than on a flat
`Uint8Array` stepper.

An example, not a finished tool: no pattern editor, no unbounded plane, no
HashLife.

## What it breaks

Every other example changes a handful of entities per tick. Life **rebuilds a
large share of the world every generation** — hundreds to thousands of spawns
and destroys per tick — and it needs **synchronous update**: every cell's fate
is decided from the previous generation before any cell changes. The example
tests that the deferred command buffer (`queueSpawn` / `queueDestroy`, flushed by
`TickRunner`) is that double buffer for free, and that the archetype index,
spatial index and renderer hold up under that churn.

## Shape

- **Setup** — one `Plugin` registers every component and tag; an `EcsWorld`
  subclass enables a `HashGrid2D` over `PositionDef` and keeps it typed. A cell
  is one `EntityTemplate` of three components and a tag.
- **Board** — a 160×100 torus; neighbours wrap with `math.wrap`.
- **Step** — a `ManualTickSource` driven by a repeating `timer` in the render
  loop (speed levels), or by hand for single steps; `TickRunner` runs a phased
  `Scheduler`:
  - `rules` counts neighbours through the spatial index and queues births and
    deaths; with trails on, a dying cell becomes its own ghost in place (queued
    tag and component swaps) instead of being destroyed;
  - `aging` bumps each survivor's age, capped;
  - `lifetime` + `ghost-fade` fade ghosts by `fraction(lifetime)` through an
    `easing` curve.
- **Stats** — `world.lifecycle` `TagAdded` / `TagRemoved` for the `cell` tag
  count births and deaths; an `EventBus` carries `Extinct` and `Settled`
  (still life or period 2, from an order-independent hash).
- **Colour** — a `.changed(AgeDef)` query recolours only the cells whose age
  moved; capped cells stop reporting.
- **Input** — `createInput` over `KeyboardProvider` + `PointerProvider`: LMB
  paints and RMB erases along a `bresenhamLine` between samples; keys pan,
  pause, step, change speed and rules, stamp presets, randomise (`rng` seed).
- **View** — a `camera` (pan, wheel zoom about the cursor, `viewToWorld` for the
  brush, `clampCameraToLimits`), `Canvas2DRenderer` with `RenderOrderDef` /
  `OpacityDef`, and a `ScreenSpaceDef` HUD.
- **Save / load** — `world.toJSON()` + rule + generation through `save`'s
  `LocalStorageBackend`.

## Checklist

- [x] Example scaffold (`package.json`, `index.html`, Vite config, tsconfig)
- [x] Plugin, components, templates
- [x] Rules, presets (RLE), systems
- [x] Main: tick wiring, input, camera, HUD, save/load
- [x] Register in manifest, loaders, hub; example README
- [x] Log engine gaps in the ledger
- [x] Regenerate `docs:usage`; lint, typecheck, tests green; run it in a browser

## Outcome

The churn is the finding: a spawn or destroy costs one archetype move per
component, so the early generations of a soup take ~55 ms in Chromium. The
first cut (ghosts as fresh entities, five components per cell) took ~120 ms;
trimming the cell and ghosting in place brought it to ~55 ms, falling to
10–20 ms as the soup thins. Logged
in the gap ledger with the spatial-index and registration findings.
