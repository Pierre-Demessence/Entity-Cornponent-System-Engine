import type { InputProvider } from '#input-source';

import { createActionTracker } from './action-tracker';

/**
 * Maps action names (caller-defined string literal type) to one or more
 * provider codes. A single action may alias multiple codes (e.g. arrow
 * keys + WASD both triggering `'left'`).
 */
export type InputMap<TAction extends string> = Readonly<Record<TAction, readonly string[]>>;

/**
 * Edge-detected action state. Hold detection is continuous; press /
 * release edges persist across the tick window and reset when
 * `clearEdges()` is called.
 */
export interface InputState<TAction extends string> {
  /** Clears the per-tick edge sets. Typically called at the tick boundary. */
  clearEdges: () => void;
  /** Backward-compatible convenience: unsubscribe and dispose every provider. */
  dispose: () => void;
  isDown: (action: TAction) => boolean;
  justPressed: (action: TAction) => boolean;
  justReleased: (action: TAction) => boolean;
  /** Unsubscribes this state from every provider without disposing providers. */
  unsubscribe: () => void;
}

/**
 * Wires one or more `InputProvider`s to an action map and returns a
 * tick-boundary edge-detected `InputState`.
 *
 * Edge semantics are **action-level** (not code-level): `justPressed`
 * fires when an action transitions from zero keys down to at least one,
 * `justReleased` when the last down key for the action is released.
 * Holding one alias and pressing another does NOT re-fire `justPressed`.
 *
 * Providers are NOT started here — KeyboardProvider attaches its
 * listeners on construction. The factory simply subscribes for the
 * translation layer.
 */
export function createInput<TAction extends string>(
  map: InputMap<TAction>,
  providers: readonly InputProvider[],
): InputState<TAction> {
  const tracker = createActionTracker<TAction>(map);
  const unsubs = providers.map(p => p.subscribe(tracker.handle));
  let unsubscribed = false;

  function unsubscribe(): void {
    if (unsubscribed)
      return;
    unsubscribed = true;
    for (const u of unsubs)
      u();
  }

  return {
    clearEdges: tracker.clearEdges,
    isDown: tracker.isDown,
    justPressed: tracker.justPressed,
    justReleased: tracker.justReleased,
    unsubscribe,
    dispose() {
      unsubscribe();
      for (const p of providers)
        p.dispose();
    },
  };
}
