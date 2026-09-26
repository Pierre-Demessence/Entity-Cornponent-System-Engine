import type { TickInfo, TickSource } from '#tick-source';

/**
 * Configuration for `FixedAccumulatorTickSource`.
 */
export interface FixedAccumulatorTickSourceOptions {
  /** Simulation step size, in milliseconds. Must be positive and finite. */
  fixedDtMs: number;
  /**
   * Maximum catch-up steps per `advance()` call. Any time still owed after
   * this many steps is dropped, which is what prevents the spiral of death.
   * Defaults to `8`, matching Godot's `max_physics_steps_per_frame`.
   */
  maxStepsPerFrame?: number;
}

/**
 * Fixed-timestep tick source with an interpolation factor. Consumes real
 * elapsed frame time via `advance(frameDeltaMs)` and emits zero or more ticks,
 * each advancing the world by a constant `fixedDtMs`. Suitable for:
 * - Physics that must be frame-rate-independent and deterministic while the
 *   display refresh rate varies.
 * - Render loops that want to draw between the last two simulation states.
 *
 * Caller-pumped: `advance()` is called from the app's existing render loop
 * (typically an `AnimationFrameTickSource` subscriber), so this source owns no
 * timer of its own. `start()` / `stop()` are no-ops for interface parity with
 * time-driven sources, mirroring `ManualTickSource`.
 *
 * Emits `TickInfo { kind: 'fixed', deltaMs: fixedDtMs, tickNumber }`. The
 * leftover time is exposed as {@link alpha} (in `[0, 1)`), which the renderer
 * reads at draw time to interpolate between simulation states.
 *
 * `maxStepsPerFrame` caps catch-up ticks per call; excess accumulated time is
 * dropped, not carried, so a slow frame cannot cascade into an ever-growing
 * backlog.
 */
export class FixedAccumulatorTickSource implements TickSource {
  private accumulatorMs = 0;
  private readonly fixedDtMs: number;
  private readonly handlers = new Set<(info: TickInfo) => void>();
  private readonly maxStepsPerFrame: number;
  private nextTickNumber = 0;

  constructor(options: FixedAccumulatorTickSourceOptions) {
    const { fixedDtMs, maxStepsPerFrame = 8 } = options;
    if (!Number.isFinite(fixedDtMs) || fixedDtMs <= 0) {
      throw new Error(`FixedAccumulatorTickSource: fixedDtMs must be a positive finite number, got ${fixedDtMs}.`);
    }
    if (!Number.isInteger(maxStepsPerFrame) || maxStepsPerFrame <= 0) {
      throw new Error(`FixedAccumulatorTickSource: maxStepsPerFrame must be a positive integer, got ${maxStepsPerFrame}.`);
    }
    this.fixedDtMs = fixedDtMs;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  /**
   * Fold real elapsed frame time into the accumulator and emit up to
   * `maxStepsPerFrame` fixed steps. Non-finite or non-positive deltas are
   * ignored.
   */
  advance(frameDeltaMs: number): void {
    if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0)
      return;
    this.accumulatorMs += frameDeltaMs;
    let steps = 0;
    while (this.accumulatorMs >= this.fixedDtMs && steps < this.maxStepsPerFrame) {
      this.emit();
      this.accumulatorMs -= this.fixedDtMs;
      steps += 1;
    }
    // Spiral-of-death clamp: if catch-up hit the cap with time still owed,
    // drop the excess so alpha stays in [0, 1) and the backlog cannot grow.
    if (this.accumulatorMs >= this.fixedDtMs)
      this.accumulatorMs %= this.fixedDtMs;
  }

  /** Leftover accumulated time as a fraction of `fixedDtMs`, in `[0, 1)`. */
  get alpha(): number {
    return this.accumulatorMs / this.fixedDtMs;
  }

  private emit(): void {
    const info: TickInfo = {
      deltaMs: this.fixedDtMs,
      kind: 'fixed',
      tickNumber: this.nextTickNumber++,
    };
    for (const handler of this.handlers) handler(info);
  }

  start(): void {}

  stop(): void {}

  subscribe(handler: (info: TickInfo) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get tickNumber(): number {
    return this.nextTickNumber - 1;
  }
}
