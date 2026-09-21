/**
 * A finite-state machine's runtime value: the state it's in and how long
 * it has been there. Deliberately tiny and serialisable — the *behaviour*
 * (transitions, side effects) lives in an {@link FsmStates} map of
 * closures held by the app, exactly like a system, so this value can sit
 * in a component or a plain controller object.
 */
export interface Fsm<TKey extends string> {
  current: TKey;
  /** Milliseconds spent in `current` since it was entered (reset on transition). */
  elapsedMs: number;
}

/**
 * One state's behaviour. `update` returns the next state key to
 * transition, or `null` to stay. `onEnter` / `onExit` fire on transition
 * boundaries — use them to reset timers or set a target. `self` gives the
 * handler the machine's `elapsedMs` (time-in-state) and `current`.
 */
export interface FsmState<TCtx, TKey extends string> {
  onEnter?: (ctx: TCtx, self: Fsm<TKey>) => void;
  onExit?: (ctx: TCtx, self: Fsm<TKey>) => void;
  update: (ctx: TCtx, self: Fsm<TKey>) => TKey | null;
}

/** The full state table: every key maps to its behaviour. */
export type FsmStates<TCtx, TKey extends string> = Record<TKey, FsmState<TCtx, TKey>>;

/** A machine starting in `initial` with zero time-in-state. */
export function makeFsm<TKey extends string>(initial: TKey): Fsm<TKey> {
  return { current: initial, elapsedMs: 0 };
}

/**
 * Advance a machine by one tick: accumulate time-in-state, run the
 * current state's `update`, and on a returned key transition — run the
 * old state's `onExit`, switch, reset `elapsedMs`, run the new state's
 * `onEnter`. Returning the same key (or `null`) stays without re-entering.
 *
 * Single-machine: to drive many entities, loop them and call `tickFsm`
 * per entity, supplying whatever per-entity context the handlers need
 * (e.g. set `ctx.currentEntity` before each call).
 *
 * Contract: `update` must return `null` or a key present in `states`
 * (returning an unmapped key throws on the follow-up `onEnter`), and a
 * handler must not call `tickFsm` on the same machine (no re-entrancy).
 */
export function tickFsm<TCtx, TKey extends string>(
  fsm: Fsm<TKey>,
  states: FsmStates<TCtx, TKey>,
  ctx: TCtx,
  dtMs: number,
): void {
  fsm.elapsedMs += dtMs;
  const next = states[fsm.current].update(ctx, fsm);
  if (next === null || next === fsm.current)
    return;
  states[fsm.current].onExit?.(ctx, fsm);
  fsm.current = next;
  fsm.elapsedMs = 0;
  states[next].onEnter?.(ctx, fsm);
}
