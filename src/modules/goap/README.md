# `@pierre/ecs/modules/goap`

Goal-oriented action planning: give an agent **actions with
preconditions/effects** and a **goal**, and `plan()` finds the least-cost
sequence that reaches it — via A\* over symbolic world-states. The payoff
over authored behaviour is that the *same goal* yields *different plans*
as the world changes.

The most advanced of the AI decision modules (after `modules/fsm` and
`modules/behavior-tree`). Canon: F.E.A.R. / Halo GOAP papers. First
consumer: [`examples/woodcutter`](../../../examples/woodcutter/).

## Scope: the pure planner

```ts
type WorldState = Record<string, boolean>; // flat boolean facts; missing = false
interface GoapAction {
  name: string;
  cost: number;
  preconditions: WorldState; // partial — keys that must match to apply
  effects: WorldState;       // partial — keys it sets
}
function plan(actions, initial, goal): GoapAction[] | null;
```

`plan` returns the ordered action list, `[]` if the goal already holds, or
`null` if unreachable. It is **pure and symbolic** — execution and
replanning stay in the consumer (map `action.name` to a runtime
behaviour, run it, and replan when a step fails or the world diverges).

## How it works

- **Boolean facts.** `WorldState` is `Record<string, boolean>`; a missing
  key reads as `false`, so `false` and absent are the same state. Chosen
  as the canonical minimal representation.
- **A\* over states.** A node is a world state (hashed by its truthy keys,
  which collapses equivalent states); an edge is an applicable action;
  edge cost is `action.cost`; the heuristic is the count of unsatisfied
  goal facts. No-op actions (effects already satisfied) are skipped to
  avoid cycles.
- **Cost shapes the plan.** Distance-, risk-, or preference-based costs
  let one goal resolve to different plans — e.g. a consumer can make
  "go to the nearest resource" fall out of the planner by pricing travel
  actions by distance.

## Consumer pattern

```ts
// 1. Derive facts from the real world.
const facts = buildFacts(agent);
// 2. Plan.
const steps = plan(ACTIONS, facts, GOAL);
// 3. Execute the current step; on success advance; on failure replan.
const status = RUNTIME[steps[i].name](agent);
```

Replanning is a consumer decision (goal changed, action failed, world
diverged). The woodcutter example replans per delivery and on a
`ChopTree{i}` failure when a tree is taken — showing both plan-time
avoidance and replan-on-failure.

## Notes

- **Zero dependencies, ECS-decoupled.** `plan` operates on plain
  `WorldState` objects; it does not touch the ECS world.
- **Handle `null`.** `plan` returns `null` when the goal is unreachable
  from the current facts — including transient cases like "every resource
  is occupied" (no applicable action can satisfy the goal *right now*).
  The consumer decides what to do: idle and replan next tick (the
  woodcutter's choice), fall back to another goal, or spawn more
  resources. `null` is a normal signal, not an error.
- **A no-op / plan-runner is not shipped.** The execute-and-replan loop is
  genuinely game-specific (it maps action names to movement/timers and
  decides when to replan), so it stays in the consumer per the rule of
  three.
- **Small state spaces.** The open set is a linear-scan priority queue —
  fine for the tens-of-nodes searches GOAP plans over. Swap in a heap only
  if a consumer plans over a large action set.
