/**
 * The `Tween` value primitive — interpolates a number `from → to` over a
 * duration along an easing curve. Composes the existing building blocks rather
 * than reinventing them: a {@link Timer} tracks time, an {@link Easing} reshapes
 * progress, and `lerp` does the value interpolation.
 *
 * A pure value (like `Timer` / `Spawner`), not an ECS component — read the
 * current value each tick wherever you animate (render, a system, a callback).
 * Single-channel; for multi-channel (x+y, RGB) run one tween per channel.
 */
import type { Easing } from '../easing';
import type { Timer, TimerMode } from '../timer';

import { linear } from '../easing';
import { lerp } from '../math';
import { finished, fraction, makeTimer, restart, tickTimer } from '../timer';

/** A number interpolated `from → to` over `timer.durationMs` along `easing`. */
export interface Tween {
  readonly easing: Easing;
  from: number;
  readonly timer: Timer;
  to: number;
}

/**
 * Create a {@link Tween} from `from` to `to` over `durationMs`. Defaults to a
 * `linear` curve and `'once'` mode; pass `'repeating'` to loop.
 */
export function makeTween(
  durationMs: number,
  from: number,
  to: number,
  easing: Easing = linear,
  mode: TimerMode = 'once',
): Tween {
  return { easing, from, timer: makeTimer(durationMs, mode), to };
}

/** Current eased value without advancing time. */
export function tweenValue(tw: Tween): number {
  return lerp(tw.from, tw.to, tw.easing(fraction(tw.timer)));
}

/** Advance the tween by `dtMs` and return the new eased value. */
export function tickTween(tw: Tween, dtMs: number): number {
  tickTimer(tw.timer, dtMs);
  return tweenValue(tw);
}

/** Whether a `'once'` tween has reached `to` (a `'repeating'` tween's per-wrap edge). */
export function tweenDone(tw: Tween): boolean {
  return finished(tw.timer);
}

/**
 * Restart the tween from the beginning. Optionally retarget `from`/`to` and the
 * duration in one call (e.g. to chase a new value).
 */
export function resetTween(
  tw: Tween,
  options: { durationMs?: number; from?: number; to?: number } = {},
): void {
  if (options.from !== undefined)
    tw.from = options.from;
  if (options.to !== undefined)
    tw.to = options.to;
  restart(tw.timer, options.durationMs);
}
