import type { InputRawEvent } from '#input-source';

/**
 * One committed action transition, as produced by `ActionTracker.handle`.
 */
export interface ActionEdge<TAction extends string> {
  action: TAction;
  kind: 'down' | 'up';
}

/**
 * Maps provider codes to actions and tracks per-action down counts — the
 * translation layer shared by the polled (`createInput`) and event
 * (`createEventInput`) input modes, so both agree on what an edge is.
 *
 * Edges are **action-level**, not code-level: a `down` edge fires when an
 * action transitions from zero aliased codes down to at least one, an `up`
 * edge when the last one releases. Pressing a second alias while the first
 * is held does NOT re-fire `down`.
 *
 * The map's value strings are the identity, whatever they are: physical key
 * codes for a code-emitting provider, produced characters when a provider
 * emits `KeyboardEvent.key`.
 */
export interface ActionTracker<TAction extends string> {
  /**
   * Clears the pending edge sets. The polled mode reads them per tick; the
   * event mode dispatches as events arrive and never calls this.
   */
  clearEdges: () => void;
  /** Feeds a raw provider event and returns the action edges it produced. */
  handle: (raw: InputRawEvent) => readonly ActionEdge<TAction>[];
  isDown: (action: TAction) => boolean;
  justPressed: (action: TAction) => boolean;
  justReleased: (action: TAction) => boolean;
}

export function createActionTracker<TAction extends string>(
  map: Readonly<Record<TAction, readonly string[]>>,
): ActionTracker<TAction> {
  const codeToActions = new Map<string, TAction[]>();
  for (const action of Object.keys(map) as TAction[]) {
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

  function handle(raw: InputRawEvent): readonly ActionEdge<TAction>[] {
    const acts = codeToActions.get(raw.code);
    if (!acts)
      return [];

    const edges: ActionEdge<TAction>[] = [];
    if (raw.kind === 'down') {
      if (downCodes.has(raw.code))
        return edges; // dedupe repeated downs for the same emitted value
      downCodes.add(raw.code);
      for (const action of acts) {
        const next = (downCount.get(action) ?? 0) + 1;
        downCount.set(action, next);
        if (next === 1) {
          pressed.add(action);
          edges.push({ action, kind: 'down' });
        }
      }
    }
    else {
      if (!downCodes.has(raw.code))
        return edges;
      downCodes.delete(raw.code);
      for (const action of acts) {
        const current = downCount.get(action) ?? 0;
        if (current <= 0)
          continue;
        const next = current - 1;
        downCount.set(action, next);
        if (next === 0) {
          released.add(action);
          edges.push({ action, kind: 'up' });
        }
      }
    }
    return edges;
  }

  return {
    handle,
    isDown: action => (downCount.get(action) ?? 0) > 0,
    justPressed: action => pressed.has(action),
    justReleased: action => released.has(action),
    clearEdges() {
      pressed.clear();
      released.clear();
    },
  };
}
