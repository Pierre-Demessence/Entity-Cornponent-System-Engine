import type { InputProvider, InputRawEvent } from '#input-source';
import type { ActionEdge } from './action-tracker';
import type { InputMap } from './input-state';

import { createActionTracker } from './action-tracker';

/**
 * A committed action transition handed to `EventInput.subscribe` handlers —
 * the event-mode counterpart of `InputState.justPressed` / `justReleased`.
 */
export type InputEvent<TAction extends string> = ActionEdge<TAction>;

/**
 * Event-driven action dispatch, for consumers with no tick to poll.
 *
 * Complementary to `InputState`: same `InputMap`, same action-level edge
 * semantics, but edges are pushed to subscribers instead of being read back
 * once per tick. A single keypress is a single dispatch, which is what
 * turn-based games want (one keypress = one turn).
 */
export interface EventInput<TAction extends string> {
  /** Unsubscribes, drops every handler, and disposes every provider. */
  dispose: () => void;
  /**
   * Registers a handler and returns a function that removes it. A given
   * function is registered once — subscribing it twice yields one
   * registration. The handler list is snapshotted per event, so a handler
   * added or removed mid-dispatch takes effect from the next event onward.
   */
  subscribe: (handler: (event: InputEvent<TAction>) => void) => () => void;
  /** Detaches from every provider without disposing them. */
  unsubscribe: () => void;
}

/**
 * Wires one or more `InputProvider`s to an action map and returns an
 * event-dispatched `EventInput`.
 *
 * Edges are **action-level** and identical to `createInput`'s: a `down`
 * event fires when an action transitions from zero aliased codes down to at
 * least one, an `up` event when the last one releases. Pressing a second
 * alias while the first is held does NOT re-fire `down`, and OS key-repeat is
 * deduped — so holding a key produces one `down`, not a stream.
 *
 * Dispatch is **synchronous**, from the provider's own DOM listener. A
 * handler therefore runs mid-tick if the key arrives mid-tick, matching
 * Godot's `_input` (which runs outside `_process`). Consumers that need
 * actions applied at a turn or tick boundary enqueue inside their handler and
 * drain at that boundary; this module deliberately owns no queue.
 *
 * Providers are NOT started here — `KeyboardProvider` attaches its listeners
 * on construction. The factory simply subscribes for the translation layer.
 *
 * A throwing handler propagates out to the provider's listener; it is not
 * swallowed, and the remaining handlers for that edge are skipped.
 */
export function createEventInput<TAction extends string>(
  map: InputMap<TAction>,
  providers: readonly InputProvider[],
): EventInput<TAction> {
  const tracker = createActionTracker<TAction>(map);
  const handlers = new Set<(event: InputEvent<TAction>) => void>();

  function handle(raw: InputRawEvent): void {
    const edges = tracker.handle(raw);
    if (edges.length === 0 || handlers.size === 0)
      return;
    const targets = [...handlers];
    for (const edge of edges) {
      for (const handler of targets)
        handler(edge);
    }
  }

  const unsubs = providers.map(p => p.subscribe(handle));
  let unsubscribed = false;

  function unsubscribe(): void {
    if (unsubscribed)
      return;
    unsubscribed = true;
    for (const u of unsubs)
      u();
  }

  return {
    unsubscribe,
    dispose() {
      unsubscribe();
      handlers.clear();
      for (const p of providers)
        p.dispose();
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
