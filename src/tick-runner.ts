import type { Scheduler } from '#scheduler';
import type { TickInfo, TickSource } from '#tick-source';
import type { EcsWorld } from '#world';

/**
 * Minimal event-bus contract the runner needs for post-tick flushing. Kept
 * structural so the runner doesn't force consumers onto any specific
 * `EventBus` type parameterization.
 */
export interface TickFlushableEvents {
  flush: () => void;
}

export interface TickRunnerOptions<TCtx> {
  scheduler: Scheduler<TCtx>;
  source: TickSource;
  /** Build the per-tick context. Called once at the start of every tick. */
  contextFactory: (info: TickInfo) => TCtx;
  /** Pull the event bus off the context for post-tick flushing. */
  getEvents: (ctx: TCtx) => TickFlushableEvents;
  /**
   * Resolve the current world. A function (not a reference) so the runner
   * reads the latest world when the consumer swaps worlds between ticks
   * (e.g. level transition on the turn boundary).
   */
  getWorld: () => EcsWorld;
  /**
   * Optional post-tick hook. Fires after the full ceremony. Receives the
   * final context so the consumer can read back per-tick state mutated
   * by a system (e.g. `pendingAction` cleared by input handling).
   */
  onTickComplete?: (ctx: TCtx, info: TickInfo) => void;
}

/**
 * Drives the per-tick ceremony in response to a `TickSource`. Consolidates
 * the sequence that every per-tick consumer would otherwise hand-roll:
 *
 * 1. `ctx = contextFactory(info)`
 * 2. `scheduler.run(ctx)`
 * 3. `ctx.events.flush()`
 * 4. `world.lifecycle.flush()`
 * 5. `world.flushDestroys()`
 * 6. `world.clearAllDirty()`
 * 7. `onTickComplete?.(ctx, info)`
 *
 * A tick is an atomic simulation step: one world from build-to-flush.
 * Consumers that need a world swap (level transition, scene change,
 * restart) queue the swap from inside a system and perform it between
 * ticks \u2014 never mid-tick.
 *
 * The runner is deliberately narrow \u2014 it knows nothing about turn
 * numbers, input actions, rendering, or game state. Those are consumer
 * concerns and live in `contextFactory` and `onTickComplete`.
 */
export class TickRunner<TCtx> {
  private readonly opts: TickRunnerOptions<TCtx>;
  private unsubscribe: (() => void) | null = null;

  constructor(opts: TickRunnerOptions<TCtx>) {
    this.opts = opts;
  }

  private handleTick(info: TickInfo): void {
    const { contextFactory, getEvents, getWorld, onTickComplete, scheduler } = this.opts;
    const ctx = contextFactory(info);
    try {
      scheduler.run(ctx);
    }
    finally {
      getEvents(ctx).flush();
      const world = getWorld();
      world.lifecycle.flush();
      world.flushDestroys();
      world.clearAllDirty();
    }
    onTickComplete?.(ctx, info);
  }

  start(): void {
    if (this.unsubscribe)
      return;
    this.unsubscribe = this.opts.source.subscribe(info => this.handleTick(info));
    this.opts.source.start();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.opts.source.stop();
  }
}
