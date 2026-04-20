import type { TickInfo, TickSource } from '#tick-source';

/**
 * Caller-driven tick source. Produces a tick only when `tick()` is invoked.
 * Suitable for:
 * - Turn-based games (one tick per player input).
 * - Tests (step the simulation programmatically).
 * - Headless simulations: AI training, replays, server-authoritative
 *   multiplayer, deterministic lockstep.
 * - REPL/debug harnesses.
 *
 * `start()`/`stop()` are no-ops \u2014 there is no internal timer to toggle;
 * they exist for interface parity with time-driven sources.
 */
export class ManualTickSource implements TickSource {
  private readonly handlers = new Set<(info: TickInfo) => void>();

  private nextTickNumber = 0;

  start(): void {}

  stop(): void {}

  subscribe(handler: (info: TickInfo) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  tick(): void {
    const info: TickInfo = {
      kind: 'discrete',
      tickNumber: this.nextTickNumber++,
    };
    for (const handler of this.handlers) handler(info);
  }

  get tickNumber(): number {
    return this.nextTickNumber - 1;
  }
}
