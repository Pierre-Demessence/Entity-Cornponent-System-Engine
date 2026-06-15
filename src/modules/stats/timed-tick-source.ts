import type { TickInfo, TickSource } from '#tick-source';
import type { FrameStats } from './frame-stats';

/**
 * Wraps a {@link TickSource} so each downstream tick's **wall-clock cost** is
 * measured and fed into a {@link FrameStats}. Use it to time work whose tick
 * source reports a *nominal* delta rather than measured time — e.g. a fixed
 * logic tick (`FixedIntervalTickSource` emits the configured interval, not how
 * long the tick actually took). Pairing this around the logic source with a
 * plain `sample(deltaMs)` of the rAF render source gives a live
 * logic-ms-vs-render-ms split (is the frame logic-bound or render-bound?).
 *
 * The wrapper measures the span across *all* subscribers' handling of a tick
 * (a single `performance.now()` bracket per emitted tick), then forwards the
 * original {@link TickInfo} unchanged. `start`/`stop`/`subscribe` delegate to
 * the wrapped source.
 *
 * Note: this times the synchronous portion of subscriber callbacks. For a
 * `TickRunner`-driven source the subscriber runs the scheduler synchronously,
 * so the measured span is the per-tick system cost.
 */
export class TimedTickSource implements TickSource {
  private readonly handlers = new Set<(info: TickInfo) => void>();
  private readonly inner: TickSource;
  private readonly now: () => number;
  private readonly stats: FrameStats;
  private unsubscribeInner: (() => void) | null = null;

  constructor(inner: TickSource, stats: FrameStats, now: () => number = defaultNow) {
    this.inner = inner;
    this.stats = stats;
    this.now = now;
  }

  start(): void {
    if (this.unsubscribeInner === null) {
      this.unsubscribeInner = this.inner.subscribe((info) => {
        const t0 = this.now();
        for (const handler of this.handlers) handler(info);
        this.stats.sample(this.now() - t0);
      });
    }
    this.inner.start();
  }

  stop(): void {
    this.inner.stop();
    this.unsubscribeInner?.();
    this.unsubscribeInner = null;
  }

  subscribe(handler: (info: TickInfo) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
