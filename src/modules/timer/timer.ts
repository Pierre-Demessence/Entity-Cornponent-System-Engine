import type { SimpleSchema } from '#index';

/** Whether a {@link Timer} stops at zero or wraps and runs again. */
export type TimerMode = 'once' | 'repeating';

/**
 * A countdown value. Embeddable anywhere — an entity component (see
 * `modules/lifetime`, `modules/cooldown`) or a plain field on game state
 * (e.g. a global spawn cadence). All fields are primitives so the struct
 * doubles as a flat {@link SimpleSchema} (see {@link timerSchema}).
 */
export interface Timer {
  /** Full span the timer counts down from; used by {@link restart}/{@link fraction}. */
  durationMs: number;
  /** True only on the tick the timer reached/passed zero. */
  justFinished: boolean;
  /** `'once'` clamps and latches at zero; `'repeating'` wraps. */
  mode: TimerMode;
  /** Milliseconds left until the timer next finishes. */
  remainingMs: number;
}

/** Flat schema for embedding {@link Timer} fields in a `simpleComponent`. */
export const timerSchema: SimpleSchema<Timer> = {
  durationMs: 'number',
  justFinished: 'boolean',
  mode: 'string',
  remainingMs: 'number',
};

/** Create a {@link Timer} of `durationMs`, ready to start counting down. */
export function makeTimer(durationMs: number, mode: TimerMode = 'once'): Timer {
  return { durationMs, justFinished: false, mode, remainingMs: durationMs };
}

/**
 * Advance `t` by `dtMs`. A `'once'` timer clamps to zero and latches; a
 * `'repeating'` timer wraps (coalescing multiple wraps in one tick into a
 * single `justFinished`). Mutates `t` in place.
 */
export function tickTimer(t: Timer, dtMs: number): void {
  t.justFinished = false;
  if (t.mode === 'once') {
    if (t.remainingMs <= 0)
      return;
    t.remainingMs -= dtMs;
    if (t.remainingMs <= 0) {
      t.remainingMs = 0;
      t.justFinished = true;
    }
    return;
  }
  if (t.durationMs <= 0)
    return;
  t.remainingMs -= dtMs;
  if (t.remainingMs <= 0) {
    // Coalesce however many full periods `dtMs` spanned into one wrap,
    // landing `remainingMs` in `(0, durationMs]` without looping per period.
    const periods = Math.floor(-t.remainingMs / t.durationMs) + 1;
    t.remainingMs += periods * t.durationMs;
    t.justFinished = true;
  }
}

/**
 * Whether the timer has reached zero. `'once'` timers stay finished once
 * they hit zero; `'repeating'` timers report the per-tick wrap edge.
 */
export function finished(t: Timer): boolean {
  return t.mode === 'once' ? t.remainingMs <= 0 : t.justFinished;
}

/** Whether the timer reached/passed zero on the most recent {@link tickTimer}. */
export function justFinished(t: Timer): boolean {
  return t.justFinished;
}

/**
 * Elapsed progress in `[0, 1]` (0 at full duration, 1 at zero). Remaining
 * progress is `1 - fraction(t)`. A zero-duration timer reads as `1`.
 */
export function fraction(t: Timer): number {
  if (t.durationMs <= 0)
    return 1;
  const elapsed = 1 - t.remainingMs / t.durationMs;
  return elapsed < 0 ? 0 : elapsed > 1 ? 1 : elapsed;
}

/** Reset the timer to full (optionally changing the duration). */
export function restart(t: Timer, durationMs?: number): void {
  if (durationMs !== undefined)
    t.durationMs = durationMs;
  t.remainingMs = t.durationMs;
  t.justFinished = false;
}
