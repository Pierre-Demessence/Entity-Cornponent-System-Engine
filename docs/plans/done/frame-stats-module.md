# Plan: Frame stats module (`@pierre/ecs/modules/stats`) + SpaceShooter HUD

A reusable, headless **frame-stats collector** in the engine, plus a
stats.js-style overlay wired into SpaceShooter. Replaces the inline
FPS accumulator currently living in the game's `render.ts`.

> Lives in the **engine repo** because the collector is the centerpiece
> and is shared by all consumers. The SpaceShooter HUD wiring (§4) is
> game-side and tracked here for completeness; when that lands it gets
> its own commit in the game repo.

## Why a module (decision)

- **Collection = engine.** Sampling frame intervals and computing
  current/min/max/avg + percentiles + a history ring is pure, DOM-free,
  testable, and every game (7 consumers) re-hand-rolls the same
  `fpsAccum / fpsFrames` block (see `render.ts` `updateFps`). Classic
  "N consumers duplicate this" → absorb into the engine.
- **Rendering = game.** Drawing the panel is consumer-specific (camera,
  letterbox, CRT look). The engine ships the *collector* and an optional
  thin Canvas2D drawer; SpaceShooter draws through its existing
  `render.ts` pipeline rather than a foreign DOM div. **No `stats.js`
  dependency** — we own a small equivalent.

## Grounding (verified facts)

- `AnimationFrameTickSource` emits **real wall-clock** `deltaMs` (0 on
  the first frame) — the render-frame clock.
  (`modules/tick/animation-frame-tick-source.ts`)
- `FixedIntervalTickSource` emits the **nominal** interval (16.67 ms),
  *not* measured time — so logic-tick *cost* must be measured with
  `performance.now()` around the dispatch, **not** read from its
  `deltaMs`. (`modules/tick/fixed-interval-tick-source.ts`)
- Module convention: `modules/<name>/{<name>.ts, <name>.test.ts,
  index.ts, README.md}`; engine `exports` maps `./modules/*` →
  `./src/modules/*/index.ts`. (mirror `modules/lifetime`)
- Game loop: rAF `renderTickSource.subscribe(() => render(ctx2d, state,
  atlases))` ([main.ts](../../SpaceShooter/src/main.ts) ~L363); logic via
  `new TickRunner({ source: tickSource, … })` (~L345). FPS is computed
  in [render.ts](../../SpaceShooter/src/render.ts) `updateFps`/`drawFps`,
  debug counts in `drawDebugCounts`/`tallyVisibility` (read
  `state.view/camera/world`).

## API sketch (`FrameStats`)

Headless, allocation-free on the hot path (sampling must not itself
cause GC — it's a perf tool).

```
class FrameStats {
  constructor(opts?: {
    windowMs?: number;     // rolling window for min/max/avg (default ~1000)
    historySize?: number;  // ring length for the sparkline (default 120)
  })
  sample(deltaMs: number): void   // call once per frame with measured ms
  reset(): void                   // clear window, ring, since-reset extremes

  // Frame time (ms) — what you optimize
  get ms(): number          // last frame
  get avgMs(): number
  get minMs(): number       // best (lowest) in window
  get maxMs(): number       // worst hitch in window

  // FPS — the headline (derived from ms)
  get fps(): number
  get avgFps(): number
  get minFps(): number
  get maxFps(): number

  // Gamer-standard lows (percentiles over the window)
  get low1Fps(): number     // 1% low  (99th-percentile frame time)
  get low01Fps(): number    // 0.1% low (99.9th-percentile)

  readonly history: ReadonlyArray<number>   // recent frame-ms for the graph

  // Generic named counters (entity counts, etc.)
  setCounter(label: string, value: number): void
  readonly counters: ReadonlyMap<string, number>
}
```

Design notes:
- Rolling window over a small ring of `(timestamp, ms)`; evict entries
  older than `windowMs`. Percentiles computed over the live window
  (copy-free: a scratch typed array reused across calls, sorted in
  place — never allocate per `sample`).
- "min/max" default to the **rolling window** (recent), which is what a
  live HUD wants; expose `reset()` for since-reset extremes.
- ms is primary, FPS derived (`1000 / ms`), because the perf work is
  about frame-time spikes (the `ALLOC_TRIGGER` GC pauses) that an
  average FPS hides.

## Tasks

### A. Engine: `FrameStats` collector

- [x] Create `modules/stats/frame-stats.ts` with the API above.
      Allocation-free `sample`; reused scratch buffer for percentiles.
- [x] `modules/stats/index.ts` barrel + `README.md` (mirror
      `modules/lifetime`).
- [x] `modules/stats/frame-stats.test.ts` — cover: cur/min/max/avg ms &
      fps over a known sequence; window eviction (old samples drop out);
      1% / 0.1% low against a crafted distribution; `reset()`; counters;
      first-sample / empty-window edge cases; no NaN on zero/one sample.
- [x] Run engine suite (`vitest run modules/stats`, then full) + lint.

### B. Engine: optional thin Canvas2D drawer (no DOM)

- [x] `modules/stats/draw-stats-overlay.ts` — `drawStatsOverlay(ctx2d,
      stats, opts)` renders the numeric block + a sparkline with a
      threshold line at `opts.targetMs ?? 16.6` ms (stats.js bars,
      colored over/under threshold). Pure Canvas2D, screen-space, no
      camera assumptions. Export from the barrel.
- [x] Keep it dependency-free and trivially skippable (games may draw
      their own). Light test: it runs without throwing against a mock
      `CanvasRenderingContext2D`.

### C. Engine: logic-vs-render split helper

The two clocks must be timed separately to answer "logic-bound vs
render-bound" live. `FixedIntervalTickSource.deltaMs` is nominal, so:

- [x] Provide a tiny `TickSource` decorator (or documented snippet)
      that measures `performance.now()` around the downstream handler
      dispatch and feeds a `FrameStats` — so the game can wrap its
      `tickSource` to capture **actual logic-tick ms**. Decide:
      decorator class in `modules/stats` vs. a documented pattern in the
      README. (Render-ms needs no decorator — rAF `deltaMs` is already
      wall-time, just `sample()` it in the render subscriber.)
      → Shipped as `TimedTickSource` (class) + README pattern. Note: must
      avoid TS parameter properties — the game compiles engine `src` with
      `erasableSyntaxOnly`, which bans them.

### D. SpaceShooter: wire the HUD (game repo, separate commit)

- [x] Add a render `FrameStats` (sample rAF `deltaMs` in the render
      subscriber) and a logic `FrameStats` (via the §C decorator around
      `tickSource`), held in `render.ts` module scope.
- [x] Replace `updateFps`/`drawFps` in
      [render.ts](../../SpaceShooter/src/render.ts) with the engine
      collector + `drawStatsOverlay`. Keep the same gating
      (`settings.showFps`) and the CRT-friendly look.
- [x] Show **render fps + ms (cur/min/max/avg)**, **1% / 0.1% low**,
      **logic ms vs render ms**, the **sparkline** (16.6 ms line), and
      **JS heap** (`performance.memory`, Chrome-only — guarded for absence;
      Firefox lacks it).
- [x] Fold the existing `drawDebugCounts` entity tallies (enemies /
      spawned / xp orbs) into `setCounter` so they render through the
      same panel (the generic-counters ask).
- [ ] Static pipeline green; **Pierre eyeballs** the overlay in both
      browsers (numbers sane, heap shows on Chrome / hidden on Firefox,
      no layout/CRT regression — this is a UI surface, agent may E2E the
      static overlay per `AGENTS.md`, but a human glance is the real
      check).

### E. Docs

- [x] Engine module `README.md` (API + the logic/render-split pattern).
- [x] Note the new module in the engine's module list / docs index if
      one exists. (`docs:api` regenerates `docs/agent/engine-api.md`;
      drift test enforces it.)
- [x] SpaceShooter: update any FPS/debug-overlay mention in `docs/` to
      point at the new panel (`docs/TODO.md`).

## Validation

- Engine: `FrameStats` unit-tested (the math is the risky part —
  percentiles, window eviction); full engine suite + lint green.
- Game: static pipeline green; human visual check of the overlay in
  Chrome **and** Firefox (heap is Chrome-only; the panel must degrade
  gracefully where `performance.memory` is absent).
- Peer-review both the engine module and the game wiring (no code edits
  / no askQuestions in the reviewer).

## Done when

- The engine exposes a tested, reusable `FrameStats` (+ optional drawer
  and logic/render-split helper).
- SpaceShooter's corner overlay shows fps + ms cur/min/max/avg, 1%/0.1%
  lows, logic-vs-render ms, a frame-time sparkline, JS heap (Chrome),
  and the live entity counters — replacing the old inline FPS code.

## Deliberately out of scope (for now)

- A draggable/collapsible DOM panel (we draw in-canvas).
- GPU timing / WebGL stats (Canvas2D renderer).
- Persisting stats across runs or exporting traces.
