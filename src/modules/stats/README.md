# `@pierre/ecs/modules/stats`

Headless frame-timing collector plus an optional Canvas2D overlay.
Replaces the inline `fps accumulator` every game re-hand-rolls. Canon
reference: mrdoob `stats.js` (panel), and the "1% / 0.1% low" frame-time
percentiles popularised by PC benchmarking.

`FrameStats` is pure and DOM-free, so it works for any loop (render rAF,
fixed logic tick, worker). Rendering is a consumer concern: ship the
collector + an optional drawer; draw your own if you prefer.

## API

```ts
class FrameStats {
  constructor(opts?: { windowMs?: number; historySize?: number });
  sample(deltaMs: number): void;   // once per frame, with MEASURED ms
  reset(): void;

  // frame time (ms) — what you optimize
  get ms(): number; get avgMs(): number; get minMs(): number; get maxMs(): number;
  // fps — headline (derived from ms)
  get fps(): number; get avgFps(): number; get minFps(): number; get maxFps(): number;
  // gamer-standard lows (percentiles over the window)
  get low1Fps(): number; get low01Fps(): number;

  get history(): number[];                       // recent frame-ms for a sparkline
  setCounter(label: string, value: number): void;
  get counters(): ReadonlyMap<string, number>;
}

function drawStatsOverlay(
  ctx2d: CanvasRenderingContext2D,
  render: FrameStats,
  opts?: StatsOverlayOptions,   // { x, y, targetMs, font, graphWidth, graphHeight, logic }
): void;

class TimedTickSource implements TickSource {
  constructor(inner: TickSource, stats: FrameStats, now?: () => number);
}
```

## Logic-vs-render split

The two clocks must be timed separately to tell logic-bound from
render-bound. The rAF source already reports measured wall-time, but a
fixed logic source reports its *nominal* interval — so time the logic
tick's actual cost with `TimedTickSource`:

```ts
const renderStats = new FrameStats();
const logicStats = new FrameStats();

// Render loop: rAF deltaMs is real wall-time.
renderSource.subscribe((info) => {
  renderStats.sample(info.deltaMs ?? 0);
  render(ctx2d, state);
  drawStatsOverlay(ctx2d, renderStats, { logic: logicStats });
});

// Logic loop: wrap the fixed source to measure per-tick cost.
const timedLogic = new TimedTickSource(logicSource, logicStats);
const runner = new TickRunner({ source: timedLogic, /* … */ });
timedLogic.start();
```

`drawStatsOverlay` shows fps + ms (cur/avg/min/max), 1% / 0.1% lows, the
optional logic-ms line, JS heap (`performance.memory`, Chrome only —
omitted elsewhere), any named counters, and a frame-time sparkline with a
threshold line at `targetMs` (default 16.6 ms).

## Notes

- `sample` is allocation-free (preallocated ring + reused percentile
  scratch) so the tool itself adds no GC pressure.
- `min`/`max` and the lows are over a rolling `windowMs` (recent), not
  all-time; `reset()` clears everything.
- Non-positive / non-finite deltas are ignored (rAF's first frame is 0; a
  backgrounded tab can spike).
