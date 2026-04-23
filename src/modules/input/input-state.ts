import type { InputProvider, InputRawEvent } from '#input-source';

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
  const codeToActions = new Map<string, TAction[]>();
  const actions = Object.keys(map) as TAction[];
  for (const action of actions) {
    for (const code of map[action]) {
      const list = codeToActions.get(code);
      if (list)
        list.push(action);
      else
        codeToActions.set(code, [action]);
    }
  }

  const downCodes = new Set<string>();
  const downCount = new Map<TAction, number>();
  const pressed = new Set<TAction>();
  const released = new Set<TAction>();
  for (const action of actions)
    downCount.set(action, 0);

  function handle(raw: InputRawEvent): void {
    const acts = codeToActions.get(raw.code);
    if (!acts)
      return;
    if (raw.kind === 'down') {
      if (downCodes.has(raw.code))
        return; // dedupe OS-level key repeat
      downCodes.add(raw.code);
      for (const a of acts) {
        const next = (downCount.get(a) ?? 0) + 1;
        downCount.set(a, next);
        if (next === 1)
          pressed.add(a);
      }
    }
    else {
      if (!downCodes.has(raw.code))
        return;
      downCodes.delete(raw.code);
      for (const a of acts) {
        const current = downCount.get(a) ?? 0;
        if (current <= 0)
          continue;
        const next = current - 1;
        downCount.set(a, next);
        if (next === 0)
          released.add(a);
      }
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
    isDown: a => (downCount.get(a) ?? 0) > 0,
    justPressed: a => pressed.has(a),
    justReleased: a => released.has(a),
    clearEdges() {
      pressed.clear();
      released.clear();
    },
    dispose() {
      unsubscribe();
      for (const p of providers)
        p.dispose();
    },
  };
}
