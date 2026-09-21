/**
 * A flat set of boolean world facts (F.E.A.R.-style symbolic state). A
 * missing key reads as `false`. Preconditions and effects are partial
 * `WorldState`s — only the keys that matter.
 */
export type WorldState = Record<string, boolean>;

/**
 * A planner action: applicable when every `preconditions` key matches the
 * current state, and applying it overwrites the `effects` keys. `cost`
 * drives the A* search toward cheaper plans.
 */
export interface GoapAction {
  name: string;
  cost: number;
  effects: WorldState;
  preconditions: WorldState;
}

function satisfied(state: WorldState, requirement: WorldState): boolean {
  for (const key in requirement) {
    if ((state[key] ?? false) !== requirement[key])
      return false;
  }
  return true;
}

function apply(state: WorldState, effects: WorldState): WorldState {
  return { ...state, ...effects };
}

/** Number of unsatisfied goal facts — an admissible-enough A* heuristic. */
function heuristic(state: WorldState, goal: WorldState): number {
  let missing = 0;
  for (const key in goal) {
    if ((state[key] ?? false) !== goal[key])
      missing++;
  }
  return missing;
}

/**
 * Stable hash of the facts relevant to planning. `false` and absent are
 * the same state, so only truthy keys (sorted) are hashed — this collapses
 * equivalent states and keeps the A* search space tight.
 */
function hash(state: WorldState): string {
  const keys = Object.keys(state).filter(k => state[k]).sort();
  return keys.join(',');
}

interface Node {
  action: GoapAction | null;
  f: number;
  g: number;
  parent: Node | null;
  state: WorldState;
}

/**
 * Find the least-cost sequence of `actions` that transforms `initial`
 * into a state satisfying `goal`, via A* over symbolic world-states.
 * Returns the ordered plan, `[]` if the goal already holds, or `null` if
 * no plan exists.
 */
export function plan(
  actions: readonly GoapAction[],
  initial: WorldState,
  goal: WorldState,
): GoapAction[] | null {
  if (satisfied(initial, goal))
    return [];

  const start: Node = { action: null, f: heuristic(initial, goal), g: 0, parent: null, state: initial };
  const open: Node[] = [start];
  const bestG = new Map<string, number>([[hash(initial), 0]]);

  while (open.length > 0) {
    // Pop the lowest-f node (linear scan — planning spaces are tiny).
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f)
        bestIdx = i;
    }
    const current = open.splice(bestIdx, 1)[0];

    if (satisfied(current.state, goal))
      return reconstruct(current);

    for (const action of actions) {
      if (!satisfied(current.state, action.preconditions))
        continue;
      const nextState = apply(current.state, action.effects);
      const key = hash(nextState);
      if (key === hash(current.state))
        continue; // no-op action; skip to avoid cycles
      const g = current.g + action.cost;
      if (g >= (bestG.get(key) ?? Infinity))
        continue;
      bestG.set(key, g);
      open.push({ action, f: g + heuristic(nextState, goal), g, parent: current, state: nextState });
    }
  }

  return null;
}

function reconstruct(goalNode: Node): GoapAction[] {
  const out: GoapAction[] = [];
  let node: Node | null = goalNode;
  while (node && node.action) {
    out.push(node.action);
    node = node.parent;
  }
  out.reverse();
  return out;
}
