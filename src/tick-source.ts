/**
 * Monotonic, source-specific per-tick snapshot. Passed to subscribers.
 *
 * - `tickNumber` is a source-local counter that starts at 0 and increments
 *   once per emitted tick. Different sources maintain independent counters.
 * - `deltaMs` is present only for time-driven sources (fixed/variable). Pure
 *   discrete sources (e.g. turn-based games) omit it.
 * - `kind` lets consumers branch on source category without type-narrowing
 *   on the concrete implementation.
 */
export interface TickInfo {
  readonly deltaMs?: number;
  readonly kind: 'discrete' | 'fixed' | 'variable';
  readonly tickNumber: number;
}

/**
 * Pluggable "when does a tick fire" contract. Core ships the interface;
 * concrete implementations (`ManualTickSource`, future `FixedTickSource`,
 * `VariableTickSource`, …) live in `@pierre/ecs/modules/tick`.
 *
 * Implementations decide how ticks are produced (caller-driven, interval,
 * requestAnimationFrame, fixed accumulator, …) and `TickRunner` stays
 * source-agnostic.
 */
export interface TickSource {
  start: () => void;
  stop: () => void;
  subscribe: (handler: (info: TickInfo) => void) => () => void;
}
