/**
 * Cadence emitter — the repeating sibling of `modules/timer`. A {@link Spawner}
 * counts down toward an emit, fires a callback, then reschedules with a freshly
 * computed interval (fixed, difficulty-ramped, or jittered). Overshoot carries
 * into the next cycle so cadence stays drift-free.
 *
 * Unlike `Timer`, a `Spawner` owns its own signed accumulator rather than
 * embedding a `Timer`: once-mode `Timer` clamps overshoot to zero and
 * repeating-mode wraps with a fixed duration, neither of which supports a fresh
 * per-cycle interval with drift-free carry.
 */

/** A repeating cadence that emits on each elapsed interval. */
export interface Spawner {
  /** Milliseconds left until the next emit; counts down past zero, then carries. */
  remainingMs: number;
  /**
   * Optional gate. While it returns `false` the spawner is held reset and
   * emits nothing; re-enabling fires on the first eligible tick.
   */
  readonly active?: () => boolean;
  /**
   * Interval (ms) until the next emit. Called lazily before the first emit and
   * after every emit, so it may return a constant, a difficulty ramp, or a
   * jittered value. It is never invoked at construction, so a provider may
   * safely read game state that is wired up after the spawner.
   */
  readonly nextIntervalMs: () => number;
}

/** Options for {@link makeSpawner}. */
export interface SpawnerOptions {
  active?: () => boolean;
}

const MAX_EMITS_PER_TICK = 10_000;

/**
 * Create a {@link Spawner} scheduled to first emit after `nextIntervalMs()`.
 * The first interval is computed lazily on the first {@link tickSpawner} call
 * (or an explicit {@link resetSpawner}), so `nextIntervalMs` is never invoked
 * during construction and may close over game state created afterward.
 */
export function makeSpawner(
  nextIntervalMs: () => number,
  options: SpawnerOptions = {},
): Spawner {
  return { active: options.active, nextIntervalMs, remainingMs: Number.NaN };
}

/**
 * Advance the spawner by `dtMs`, invoking `emit` once per elapsed interval.
 * Overshoot carries into the next cycle. A non-positive interval halts
 * emission for that tick (guards against an infinite loop), as does a hard
 * per-tick emit cap.
 */
export function tickSpawner(s: Spawner, dtMs: number, emit: () => void): void {
  if (s.active && !s.active()) {
    s.remainingMs = 0;
    return;
  }
  // Lazy first-interval seed: deferred from construction so providers may read
  // game state that is wired up after the spawner.
  if (Number.isNaN(s.remainingMs))
    s.remainingMs = s.nextIntervalMs();
  s.remainingMs -= dtMs;
  let emits = 0;
  while (s.remainingMs <= 0) {
    emit();
    const next = s.nextIntervalMs();
    if (next <= 0) {
      s.remainingMs = 0;
      return;
    }
    s.remainingMs += next;
    if (++emits >= MAX_EMITS_PER_TICK)
      return;
  }
}

/** Reschedule the spawner (defaults to a fresh `nextIntervalMs()` interval). */
export function resetSpawner(s: Spawner, remainingMs?: number): void {
  s.remainingMs = remainingMs ?? s.nextIntervalMs();
}
