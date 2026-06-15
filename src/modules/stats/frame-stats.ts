/**
 * Headless frame-timing collector: feed it the measured duration of each
 * frame (or logic tick) and read back current/min/max/avg frame time and
 * FPS, gamer-standard 1% / 0.1% lows, a recent-history ring for sparklines,
 * and arbitrary named counters.
 *
 * Pure and DOM-free so it works for any loop (render rAF, fixed logic tick,
 * a worker). Rendering a panel is a consumer concern — see
 * {@link drawStatsOverlay} for an optional Canvas2D drawer, or read the
 * getters and draw your own.
 *
 * `sample` is allocation-free on the hot path (a frame-stats tool must not
 * itself create GC pressure): samples live in preallocated ring buffers and
 * percentiles sort a reused scratch array in place.
 */
export interface FrameStatsOptions {
  /**
   * Number of recent frame durations retained for {@link FrameStats.history}
   * (the sparkline). Also caps the rolling-window ring, so a window holding
   * more frames than this silently drops the oldest from the stats too — size
   * it for your worst-case frame rate (default 120 ≈ 2s at 60fps).
   */
  historySize?: number;
  /**
   * Rolling window (ms) over which min/max/avg and the percentile lows are
   * computed, so the HUD reflects *recent* behaviour rather than all-time.
   * Default 1000.
   */
  windowMs?: number;
}

const DEFAULT_WINDOW_MS = 1000;
const DEFAULT_HISTORY = 120;

export class FrameStats {
  private readonly capacity: number;
  /** Monotonic clock for window eviction; advanced by each `sample`. */
  private clockMs = 0;

  private readonly counterMap = new Map<string, number>();
  /** Ring head (index of the next write) and current live sample count. */
  private head = 0;
  private lastMs = 0;
  /** Reused scratch for in-place percentile sorting (length === capacity). */
  private readonly scratch: Float64Array;
  private size = 0;
  private readonly stamps: Float64Array;
  /** Ring of recent frame durations (ms) and the wall-clock time each was recorded. */
  private readonly times: Float64Array;

  private readonly windowMs: number;

  constructor(options: FrameStatsOptions = {}) {
    this.windowMs = Math.max(0, options.windowMs ?? DEFAULT_WINDOW_MS);
    this.capacity = Math.max(1, Math.floor(options.historySize ?? DEFAULT_HISTORY));
    this.times = new Float64Array(this.capacity);
    this.stamps = new Float64Array(this.capacity);
    this.scratch = new Float64Array(this.capacity);
  }

  /** The i-th live sample, oldest (i=0) to newest. */
  private at(i: number): number {
    const idx = (this.head - this.size + i + this.capacity) % this.capacity;
    return this.times[idx]!;
  }

  get avgFps(): number {
    return msToFps(this.avgMs);
  }

  // -- Frame time (ms) ---------------------------------------------------

  get avgMs(): number {
    if (this.size === 0)
      return 0;
    let sum = 0;
    for (let i = 0; i < this.size; i++)
      sum += this.at(i);
    return sum / this.size;
  }

  get counters(): ReadonlyMap<string, number> {
    return this.counterMap;
  }

  get fps(): number {
    return msToFps(this.lastMs);
  }

  /**
   * Recent frame durations (ms) oldest→newest, for a sparkline. A fresh
   * array is built per call (small, bounded by `historySize`); call it once
   * per draw, not in the hot loop.
   */
  get history(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.size; i++)
      out.push(this.at(i));
    return out;
  }

  // -- FPS (derived; headline) ------------------------------------------

  /** 0.1% low FPS: the 99.9th-percentile frame time expressed as FPS. */
  get low01Fps(): number {
    return msToFps(this.percentileMs(0.999));
  }

  /** 1% low FPS: the 99th-percentile frame time expressed as FPS. */
  get low1Fps(): number {
    return msToFps(this.percentileMs(0.99));
  }

  /** Highest FPS in the window — derived from the *best* frame time. */
  get maxFps(): number {
    return msToFps(this.minMs);
  }

  /** Worst (longest) frame in the window — the visible hitch. */
  get maxMs(): number {
    if (this.size === 0)
      return 0;
    let m = 0;
    for (let i = 0; i < this.size; i++)
      m = Math.max(m, this.at(i));
    return m;
  }

  /** Lowest FPS in the window — derived from the *worst* frame time. */
  get minFps(): number {
    return msToFps(this.maxMs);
  }

  /** Best (shortest) frame in the window. */
  get minMs(): number {
    if (this.size === 0)
      return 0;
    let m = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.size; i++)
      m = Math.min(m, this.at(i));
    return m;
  }

  // -- History + counters -----------------------------------------------

  /** Most recent frame duration (ms), or 0 before the first sample. */
  get ms(): number {
    return this.lastMs;
  }

  /**
   * Frame time (ms) at percentile `p` (0..1) over the window — e.g. p=0.99
   * is the frame time that 99% of frames came in under, i.e. the 1% worst.
   * Sorts a reused scratch buffer in place; no per-call buffer copy (only a
   * small typed-array view), so it's safe to call per drawn frame.
   */
  private percentileMs(p: number): number {
    if (this.size === 0)
      return 0;
    for (let i = 0; i < this.size; i++)
      this.scratch[i] = this.at(i);
    const view = this.scratch.subarray(0, this.size);
    view.sort();
    const rank = Math.min(this.size - 1, Math.max(0, Math.ceil(p * this.size) - 1));
    return view[rank]!;
  }

  /** Clear all samples, counters, and the internal clock. */
  reset(): void {
    this.head = 0;
    this.size = 0;
    this.clockMs = 0;
    this.lastMs = 0;
    this.counterMap.clear();
  }

  // -- Internals ---------------------------------------------------------

  /**
   * Record one frame's measured duration (ms). Advances an internal clock by
   * `deltaMs` and evicts samples older than `windowMs`. Non-positive or
   * non-finite deltas are ignored (the first rAF frame reports 0, and a
   * paused tab can yield spikes/NaN — neither should pollute the stats).
   */
  sample(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0)
      return;
    this.lastMs = deltaMs;
    this.clockMs += deltaMs;

    this.times[this.head] = deltaMs;
    this.stamps[this.head] = this.clockMs;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity)
      this.size++;

    // Drop samples that have aged out of the rolling window. The ring is
    // chronological, so eviction only ever trims the oldest entries.
    const cutoff = this.clockMs - this.windowMs;
    while (this.size > 0) {
      const oldest = (this.head - this.size + this.capacity) % this.capacity;
      if (this.stamps[oldest]! >= cutoff)
        break;
      this.size--;
    }
  }

  /** Set/overwrite a named counter (e.g. live entity counts) for display. */
  setCounter(label: string, value: number): void {
    this.counterMap.set(label, value);
  }
}

function msToFps(ms: number): number {
  return ms > 0 ? 1000 / ms : 0;
}
