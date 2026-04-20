import type { TickInfo, TickSource } from '#tick-source';

/**
 * Time-driven tick source that fires at a fixed interval via `setInterval`.
 * Suitable for:
 * - Real-time prototypes (arcade games, sandboxes) that want a simple
 *   "simulate at N Hz" timer without building a fixed-step accumulator.
 * - Any consumer where drift under tab-throttling is acceptable.
 *
 * Emits `TickInfo { kind: 'fixed', deltaMs: intervalMs, tickNumber }`.
 * `deltaMs` is the nominal interval, not the measured wall time — callers
 * that need wall-time accuracy should use an rAF-driven source instead.
 *
 * `start()` and `stop()` are idempotent; calling either repeatedly is a
 * no-op in the already-started/stopped state. Unsubscribed handlers stop
 * receiving ticks, but the interval timer remains active until `stop()` is
 * explicitly called — callers are responsible for stopping the source.
 */
export class FixedIntervalTickSource implements TickSource {
  private readonly handlers = new Set<(info: TickInfo) => void>();
  private readonly intervalMs: number;
  private nextTickNumber = 0;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(intervalMs: number) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
      throw new Error(`FixedIntervalTickSource: intervalMs must be a positive finite number, got ${intervalMs}.`);
    }
    this.intervalMs = intervalMs;
  }

  private emit(): void {
    const info: TickInfo = {
      deltaMs: this.intervalMs,
      kind: 'fixed',
      tickNumber: this.nextTickNumber++,
    };
    for (const handler of this.handlers) handler(info);
  }

  start(): void {
    if (this.timer !== undefined)
      return;
    this.timer = setInterval(() => this.emit(), this.intervalMs);
  }

  stop(): void {
    if (this.timer === undefined)
      return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  subscribe(handler: (info: TickInfo) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get tickNumber(): number {
    return this.nextTickNumber - 1;
  }
}
