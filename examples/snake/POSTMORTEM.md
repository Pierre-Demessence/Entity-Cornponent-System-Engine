# Snake Postmortem — Rung 1

**Prototype:** Snake (arcade grid, 4-way keyboard, grow-on-food, die-on-self/wall).
**Engine version:** `@pierre/ecs` as of commit `0c602e5` + `9a3c07b`.
**LOC:** 298 (29 components.ts + 269 main.ts). Budget: < 300.
**Engine edits required:** **zero**. Rule R1 held.

## What worked (engine is doing its job)

- **`EcsWorld` + `ComponentStore` + `TagStore`** are comfortable for a
  non-roguelike consumer. Registering `position`, `direction`, and three
  tags was ~10 lines and felt idiomatic.
- **`enableSpatial(PositionDef)` + `world.spatial.getAt(x, y)`** is the
  one-liner I hoped for. Self-collision check is literally:

  ```ts
  const occupants = world.spatial.getAt(nx, ny);
  ```

  `getAt` returning `ReadonlySet<EntityId> | undefined` made the ate-a-segment
  check trivial (filter out the tail, any remaining hit = death). No custom
  grid code in the consumer.
- **`world.move(id, x, y)` keeps the spatial index live.** Using it for
  the head + every body segment meant `getAt` was always accurate on the
  next tick — no manual index maintenance.
- **`ManualTickSource` + `setInterval`** was the right escape hatch for
  a first real-time prototype. ~3 lines of plumbing:

  ```ts
  const tickSource = new ManualTickSource();
  tickSource.subscribe(() => { scheduler.run(state); /* flushes */ });
  setInterval(() => tickSource.tick(), 125);
  ```

  Predicted a `FixedIntervalTickSource` would emerge; it did *not* feel
  earned yet — one consumer, three lines. Rule of Three says wait.
- **`Scheduler.add(inputSystem).add(movementSystem)` with `runAfter`**
  ordered them correctly the first try. Passing `GameState` as the
  scheduler context let systems see mutable app state (`pendingDir`,
  `segments` array, `score`) without the engine caring.
- **`EventBus` for `AppleEaten` / `GameOver`** is quiet and correct.
  Handlers registered in `start()` (not as systems) feels right — they
  are app-level reactions, not per-entity logic.
- **Public import path (`@pierre/ecs` + `@pierre/ecs/modules/tick`)**
  worked verbatim once npm workspaces was enabled. Rule R4 held.
- **Teardown is clean.** `unsubscribeTick()` + `clearInterval` +
  `cancelAnimationFrame` + `removeEventListener` + `container.innerHTML = ''`
  fully restores the page. Verified manually in the browser by calling
  `start(div)` twice — no leaked intervals, no double-input.

## What was awkward / small friction

- **`ComponentDef<T>` requires `serialize` / `deserialize` even when the
  prototype has no save/load.** Snake hits this for `Position` and
  `Direction` — eight lines of boilerplate that do nothing at runtime.
  - *Not an engine bug.* Save-enablement is the whole point of the
    contract. But a future ergonomic helper like
    `simpleComponent<T>(name, keys)` or a default round-trip generated
    from a key list would save prototypes from this ceremony.
  - **Decision:** don't promote yet. One consumer (Snake), eight lines.
    Revisit if Asteroids needs the same pattern.

- **Tag `TagStore` doesn't expose a single-arg `clear()`-by-tag helper
  at the `World` level** — you call `world.getTag(tag).clear()`. Fine,
  but the reset-everything path in Snake reads as a small repetitive
  block:

  ```ts
  world.getStore(PositionDef).clear();
  world.getStore(DirectionDef).clear();
  world.getTag(SnakeHeadTag).clear();
  world.getTag(SnakeSegmentTag).clear();
  world.getTag(FoodTag).clear();
  world.spatial.clear();
  ```

  A `world.clearAll()` or `world.reset()` would help prototypes that
  tear down and rebuild mid-session. Asteroids will probably want this
  too (respawn on death). **Flagging as a possible M-next candidate.**

- **Rendering outside `Scheduler` is the right choice** but means the
  renderer can't participate in dependency ordering (fine here — nothing
  depends on it). The `RenderSystem`-as-a-scheduler-system anti-pattern
  was avoided by design. No action needed; document the pattern in
  `extending-the-engine.md` when a second prototype confirms it.

- **`world.flushDestroys()` + `world.lifecycle.flush()` + `events.flush()`**
  three separate flushes per tick is noisy. For Snake it's fine, but a
  convenience `world.endOfTick()` that chains the two engine flushes in
  the right order would kill a common footgun (flushing `lifecycle`
  before `flushDestroys` breaks sub subscribers).
  - **Decision:** not yet. The roguelike already does this via
    `TickRunner`; Snake chose to run the scheduler without TickRunner
    because TickRunner wants `TickFlushableEvents` set up. Revisit if a
    third consumer also wants the no-TickRunner manual path.

## What was surprising

- **The engine reads as single-consumer-designed in places but worked
  for Snake without edits.** I expected at least one forced engine
  tweak. The `SchedulableSystem` `reads`/`writes` fields being optional
  - the `TCtx` generic being fully open meant Snake's `GameState`
  context type slotted in without ceremony.

- **`HashGrid2D` spill-over into the `spatial` accessor's type.**
  `world.spatial` is typed as `HashGrid2D` specifically (not the
  abstract `SpatialStructure`) so `getAt` is directly callable. That's
  the pragmatic choice but means a non-grid backend would need a
  subclass override. Not a Snake problem; documented reality of the
  current design.

- **`noUncheckedSideEffectImports: true`** in the root tsconfig made
  me double-check nothing in the example relied on side-effectful
  imports. Nothing did — the example has none. Good forcing function.

- **Bundle size: 19.86 kB (6.53 kB gz)** for the whole snake game
  including the ECS engine. The engine `sideEffects: false` and ESM
  exports are paying off — only what Snake imports ships.

## Engine gaps identified (feed into audit / roadmap)

| # | Gap | Promotion bar | Status |
|---|---|---|---|
| 1 | `FixedIntervalTickSource` (self-driving timer-based TickSource) | 2 consumers — Snake alone not enough | Deferred; Asteroids is likely consumer #2. |
| 2 | `simpleComponent<T>(name, keys)` helper for prototypes without save/load | 3 consumers — ergonomic, not blocking | Deferred. |
| 3 | `world.clearAll()` / `world.reset()` | 2 consumers — "respawn" pattern is likely universal | Deferred; will likely land with Asteroids. |
| 4 | `world.endOfTick()` (chains `flushDestroys` + `lifecycle.flush`) | 2 consumers OR one roguelike-side simplification | Deferred. |
| 5 | Consistent way to flush app-level EventBus alongside engine flushes | Natural fit inside `TickRunner` if the prototype opts in | No action. `TickRunner` already solves it. |

None of these rose to "promote now" per
[extending-the-engine.md](../../docs/extending-the-engine.md) §
Rule of Three. All belong in the engine-debt list, not the next commit.

## Verdict

**Rule R1 held: the engine is byte-identical.** One genre shift
(turn-based → real-time) with no engine edits is a real data point for
generality. It doesn't prove the engine is good — it proves the engine
wasn't *badly* overfit to the roguelike.

The next prototype (Asteroids, Rung 2 — continuous coordinates) will
stress things this one didn't:

- `enableSpatial` with a non-grid structure (or grid with cell-size).
- Fixed-step physics tick + variable render frame (a real reason for
  the `FixedIntervalTickSource` that Snake didn't earn).
- Entity lifecycle events (bullet-vs-asteroid spawn cascade).

If Asteroids still needs zero engine edits, the engine is probably
ready for a third consumer (maybe public). If it needs one or two small
additions, that's where Rule of Three kicks in and we promote.
