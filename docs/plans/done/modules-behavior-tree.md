# modules/behavior-tree — reactive behaviour trees (AI pick #3)

Third AI primitive, the "more advanced" step past `modules/fsm`. A BT
composes prioritised, hierarchical behaviour from a small node taxonomy
with a tri-state tick (`success` / `failure` / `running`). Continues the
brain + muscles story: BT leaf actions drive movement via
`modules/steering`.

## Design: reactive / stateless node-as-function (A)

Chosen over stateful nodes (B). A node is a pure `(ctx) => BtStatus`; the
whole tree re-ticks from the root each frame; `running` short-circuits;
per-agent memory lives in a **blackboard** on `ctx` (set per-agent before
ticking, exactly like `fsm`'s `ctx.activeGuard`). This matches how most
game BTs behave (re-evaluate priorities each tick so higher-priority
behaviours preempt), fits a *shared* tree ticked by many agents with zero
per-node state, and stays pure/tree-shakeable. Canon: Unreal Behavior
Tree + Blackboard, behaviortree.cpp, Halo/Bungie published trees.

## Target surface (minimal canon-complete)

```ts
type BtStatus = 'success' | 'failure' | 'running';
type BtNode<TCtx> = (ctx: TCtx) => BtStatus;

function sequence<TCtx>(...children: BtNode<TCtx>[]): BtNode<TCtx>; // AND: fail-fast, running-short-circuit
function selector<TCtx>(...children: BtNode<TCtx>[]): BtNode<TCtx>; // OR / fallback: succeed-fast
function inverter<TCtx>(child: BtNode<TCtx>): BtNode<TCtx>;         // swap success/failure
function condition<TCtx>(pred: (ctx: TCtx) => boolean): BtNode<TCtx>;
function action<TCtx>(fn: (ctx: TCtx) => BtStatus): BtNode<TCtx>;
```

`parallel`, `cooldown`, `repeat`/`repeatUntil` decorators deferred until a
consumer needs them (novel/less-universal — rule of three).

## Open questions the PoC resolves

- **Reactive re-tick is enough?** Confirm no consumer needs a remembered
  running-child (stateful) — the blackboard should carry any needed
  cross-tick memory (target food, home).
- **Leaf action + movement.** A movement leaf applies velocity via
  `modules/steering` directly (only one branch reaches a moving leaf per
  tick, so no conflict). Confirm that's clean vs. a separate move step.
- **Status of a "hold" behaviour.** `wander`/`flee` return `running` so
  the selector stops there; instant behaviours (`eat`) return `success`.

## The PoC: needs-driven critters

Creatures roaming a field, each ticking the same shared BT:

```
Selector (first non-Failure wins):
  Sequence[ isThreatened? → flee cursor (steering) ]
  Sequence[ isHungry?     → go to nearest food (arrive) → eat ]
  Sequence[ isTired?      → go home to nest (arrive) → rest ]
  action( wander )                                   // default fallback
```

Exercises the whole surface — `running` (multi-tick travel), success /
failure, `sequence`, `selector`, a decorator, leaf action + condition,
and a per-critter blackboard (hunger / energy meters, target food, home).
An FSM would tangle here; a BT reads top-to-bottom by priority.

## Workflow

1. Local `bt.ts` + critters game in `examples/critters`.
2. Tune meters/thresholds until behaviour reads clearly.
3. Extract `src/modules/behavior-tree/` (+ tests).
4. Migrate the example to consume it.

## Checklist

- [x] Plan doc (this file).
- [x] Scaffold `examples/critters`.
- [x] Local `bt.ts` (`BtStatus`, `sequence`, `selector`, `inverter`,
      `condition`, `action`).
- [x] Critters game: needs-driven BT + blackboard, steering movement,
      cursor threat / food / home.
- [x] Tune until behaviour reads clearly. (Pierre playtested; accepted.)
- [x] Register in `examples/hub`.
- [x] Example `build` + `lint` pass.
- [x] Extract `src/modules/behavior-tree/` (+ colocated tests — 13 tests).
- [x] Regen `engine-api` (drift test green).
- [x] Migrate example → `@pierre/ecs/modules/behavior-tree` (local deleted).
- [x] Module README.
- [x] Docs: backlog `modules/behavior-tree` shipped entry + `modules/ai`
      (now GOAP-only) + promotion-trigger row.
- [x] Peer review (subagent) — no logic bugs; added nested-composite +
      deep-running-short-circuit tests. The flagged "food contention" is a
      non-issue (reactive `seekFood` refreshes `targetFood` every tick).
      Full suite 980 green.
