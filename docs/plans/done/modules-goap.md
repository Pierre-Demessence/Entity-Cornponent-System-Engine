# modules/goap — goal-oriented action planner (AI pick #4)

The "most advanced" decision AI: instead of authoring behaviour, give the
agent **actions with preconditions/effects** and a **goal**; a **planner
(A\*)** finds the action sequence itself. The payoff — and what the PoC
must show — is that the *same goal* yields *different plans* as the world
changes.

## Module scope: the pure planner only

```ts
type WorldState = Record<string, boolean>; // flat boolean facts (F.E.A.R. style)
interface GoapAction {
  name: string;
  cost: number;
  preconditions: WorldState; // partial — keys that must match to apply
  effects: WorldState;       // partial — keys it sets
}
function plan(actions, initial, goal): GoapAction[] | null; // A* over symbolic state; least-cost sequence or null
```

Pure and symbolic — the canon core (like `fsm`'s `tickFsm`). **Execution
+ replanning stay in the game**: map each `action.name` to a runtime
behaviour (walk via `modules/steering`, a chop wait), run it, apply
effects on success, advance the plan, and replan when a step fails or the
world diverges. The plan-runner is built locally in the example first;
extract it only if its shape proves out (rule of three).

## Planner design

- **Boolean facts.** `WorldState` is `Record<string, boolean>`; a missing
  key reads as `false`. Chosen over typed key/values as the canonical
  minimal representation.
- **Own tiny A\*.** `modules/pathfinding`'s A\* is grid-specific; the
  planner does its own A\* over abstract world-states (planning spaces are
  small). Node = a world state (hashed by sorted entries); edge = an
  applicable action; edge cost = `action.cost`; heuristic = count of
  unsatisfied goal facts.
- **Replanning is game-side.** The module returns a plan; when to replan
  (goal changed, action failed, world diverged) is the consumer's call.

## Open questions the PoC resolves

- Is the pure `plan()` enough, or does a `PlanRunner` (execute + replan
  loop) belong in the module? (Default: keep `plan()` pure; runner local.)
- Heuristic admissibility on small spaces — confirm plans are optimal /
  good-enough on the woodcutter action set.

## The PoC: woodcutter

Goal `{ delivered: true }`. Actions:

- `GetAxe` — pre `{hasAxe:false}`, eff `{hasAxe:true}`
- `GoToTree` — eff `{atTree:true, atStore:false}`
- `ChopWood` — pre `{hasAxe:true, atTree:true, hasWood:false}`, eff `{hasWood:true}`
- `GoToStore` — eff `{atStore:true, atTree:false}`
- `DropWood` — pre `{hasWood:true, atStore:true}`, eff `{delivered:true, hasWood:false}`

First cycle plans `GetAxe → GoToTree → ChopWood → GoToStore → DropWood`.
Once the worker holds the axe, later cycles **drop `GetAxe`** (its
precondition `hasAxe:false` no longer holds) — the visible "GOAP adapts to
the world" moment. Each worker draws its current plan + step. "Go to X"
actions reuse `modules/steering` `arrive`.

### Tree contention as world facts (per Pierre, 2026-09-21)

Upgraded from one symbolic `atTree` to **per-tree facts + actions**
(`GoToTree{i}` / `ChopTree{i}`, facts `atTree{i}` / `tree{i}Free`), so
resource contention is a *planning* concern, not execution-layer polish:

- `GoToTree{i}` cost is **distance-based**, so each worker's A\* prefers
  its nearest free tree — the GOAP-native way to spread workers out.
- `ChopTree{i}` requires `tree{i}Free`, so an occupied tree is avoided at
  plan time; a worker reserves a tree when it *starts chopping*.
- If two workers targeted the same free tree, the loser's `ChopTree{i}`
  returns `failure` → **replan** onto another free tree. Facts are derived
  from reality each replan (shared `treeOccupant[]`).

This makes both plan-time avoidance and replan-on-failure visible. The
"which physical tree" question is answered by GOAP facts + cost, not a
bolted-on reservation rule.

## Workflow

1. Local `goap.ts` (pure planner) + woodcutter game in `examples/woodcutter`.
2. Tune until the plan + adaptation read clearly (plan label per worker).
3. Extract `src/modules/goap/` (+ tests).
4. Migrate the example to consume it.

## Checklist

- [x] Plan doc (this file).
- [x] Scaffold `examples/woodcutter`.
- [x] Local `goap.ts` (`WorldState`, `GoapAction`, `plan`).
- [x] Woodcutter game: actions + goal + runtime handlers, plan-runner,
      steering movement, plan label.
- [x] Tune until planning + axe-skip adaptation read clearly. (Pierre
      playtested; requested per-tree contention — added as world facts +
      distance costs + reserve/replan; accepted.)
- [x] Register in `examples/hub`.
- [x] Example `build` + `lint` pass.
- [x] Extract `src/modules/goap/` (+ colocated tests — 8 tests).
- [x] Regen `engine-api` (drift test green).
- [x] Migrate example → `@pierre/ecs/modules/goap` (local deleted).
- [x] Module README.
- [x] Docs: backlog `modules/goap` shipped entry + `modules/ai` (now
      Utility AI / HTN) + promotion-trigger row; game-ai-landscape GOAP →
      shipped.
- [x] Peer review (subagent) — planner algorithmically sound, no bugs
      (state-hash / no-op-skip / dominance all correct). Added a
      mixed-effects test + a README note on the `null`/unreachable
      contract. Full suite 989 green.
