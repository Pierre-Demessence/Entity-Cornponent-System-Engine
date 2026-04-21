import type { TickInfo, TickSource } from '#tick-source';

/**
 * Injectable dependencies for `AnimationFrameTickSource`. Tests pass
 * synthetic scheduling primitives; production code lets the defaults
 * pick up `window.requestAnimationFrame` / `cancelAnimationFrame`.
 */
export interface AnimationFrameTickSourceOptions {
  /** Defaults to `window.cancelAnimationFrame`. */
  cancelRaf?: (handle: number) => void;
  /** Defaults to `window.requestAnimationFrame`. */
  raf?: (callback: FrameRequestCallback) => number;
}

/**
 * Time-driven tick source that fires once per `requestAnimationFrame`
 * (typically ~60 Hz, matching the display refresh rate). Suitable for:
 * - Render loops where the game draws on every frame.
 * - Edge-clearing for input that wants per-frame resolution.
 * - Variable-rate simulations that integrate with `deltaMs`.
 *
 * Emits `TickInfo { kind: 'variable', deltaMs: wall-time, tickNumber }`.
 * `deltaMs` is the measured wall-clock interval between frames (0 on the
 * very first tick since there is no previous frame to measure against).
 * Frames are delivered paused while the tab is in the background on most
 * browsers — consumers that need catch-up semantics should layer a fixed
 * accumulator on top.
 *
 * `start()` / `stop()` are idempotent. `stop()` cancels the pending
 * rAF and resets the internal timing baseline, so the next `start()`
 * begins cleanly.
 */
export class AnimationFrameTickSource implements TickSource {
  private readonly cancelRaf: (handle: number) => void;
  private readonly handlers = new Set<(info: TickInfo) => void>();
  private lastTimeMs = 0;
  private nextTickNumber = 0;
  private readonly raf: (callback: FrameRequestCallback) => number;
  private rafHandle: number | null = null;

  private readonly step = (timeMs: number): void => {
    const deltaMs = this.lastTimeMs === 0 ? 0 : timeMs - this.lastTimeMs;
    this.lastTimeMs = timeMs;
    const info: TickInfo = {
      deltaMs,
      kind: 'variable',
      tickNumber: this.nextTickNumber++,
    };
    for (const handler of this.handlers) {
      try {
        handler(info);
      }
      catch (err) {
        // Isolate handler failures: one bad subscriber must not stop
        // the frame loop or prevent other subscribers from running.
        console.error('AnimationFrameTickSource: subscriber threw', err);
      }
    }
    if (this.rafHandle !== null)
      this.rafHandle = this.raf(this.step);
  };

  constructor(options: AnimationFrameTickSourceOptions = {}) {
    const g: typeof globalThis & {
      requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame?: (handle: number) => void;
    } = globalThis;
    const raf = options.raf ?? g.requestAnimationFrame?.bind(g);
    const cancelRaf = options.cancelRaf ?? g.cancelAnimationFrame?.bind(g);
    if (!raf || !cancelRaf) {
      throw new Error(
        'AnimationFrameTickSource: requestAnimationFrame / cancelAnimationFrame '
        + 'not available. Pass options.raf / options.cancelRaf explicitly when '
        + 'no browser environment is present.',
      );
    }
    this.raf = raf;
    this.cancelRaf = cancelRaf;
  }

  start(): void {
    if (this.rafHandle !== null)
      return;
    this.rafHandle = this.raf(this.step);
  }

  stop(): void {
    if (this.rafHandle === null)
      return;
    this.cancelRaf(this.rafHandle);
    this.rafHandle = null;
    this.lastTimeMs = 0;
  }

  subscribe(handler: (info: TickInfo) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get tickNumber(): number {
    return this.nextTickNumber - 1;
  }
}
