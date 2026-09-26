# `@pierre/ecs/modules/behavior-tree`

A reactive behaviour tree built from pure functions. A node is
`(ctx) => BtStatus` (`success` / `failure` / `running`); composites and
decorators are higher-order functions that combine child nodes. Compose a
tree once and re-tick it from the root every frame — a higher-priority
branch preempts a lower one the moment its condition flips.

The step up from `@pierre/ecs/modules/fsm`: instead of "which state am I
in", you express prioritised, hierarchical behaviour — a higher-priority
branch preempts a lower one the moment its condition flips. See
[`examples/critters`](../../../examples/critters/) for needs-driven
creatures (flee > eat > sleep > wander).

## Reactive, blackboard-on-context

Nodes are **stateless**; the tree is re-evaluated from the root each tick
so priorities are always live. Any cross-tick memory (a target, a timer)
lives on the **context** you pass in — the "blackboard" — not inside
nodes. That lets one shared tree drive many agents: set the per-agent
blackboard on `ctx`, then tick.

```ts
// one shared tree
const brain = selector<Ctx>(
  sequence(condition(isThreatened), action(flee)),   // highest priority
  sequence(condition(isHungry), action(goToFood), action(eat)),
  action(wander),                                    // fallback
);

// each tick, per agent:
for (const agent of agents) {
  ctx.active = agent; // blackboard
  brain(ctx);
}
```

## API

```ts
type BtStatus = 'success' | 'failure' | 'running';
type BtNode<TCtx> = (ctx: TCtx) => BtStatus;

// Composites
function sequence<TCtx>(...children: BtNode<TCtx>[]): BtNode<TCtx>; // AND: fail-fast, running short-circuits, success if all succeed
function selector<TCtx>(...children: BtNode<TCtx>[]): BtNode<TCtx>; // OR / fallback: succeed-fast, running short-circuits, failure if all fail

// Decorator
function inverter<TCtx>(child: BtNode<TCtx>): BtNode<TCtx>;         // success ⇄ failure; running passes through

// Leaves
function condition<TCtx>(pred: (ctx: TCtx) => boolean): BtNode<TCtx>; // success if pred else failure
function action<TCtx>(fn: (ctx: TCtx) => BtStatus): BtNode<TCtx>;     // use fn's status
```

Status semantics of the composites:

| Node | returns `success` | returns `running` | returns `failure` |
|---|---|---|---|
| `sequence` | all children succeed | first child running | first child fails |
| `selector` | first child succeeds | first child running | all children fail |

## Notes

- **Zero dependencies, ECS-decoupled.** Nodes are plain functions over a
  caller-defined `ctx`. No component coupling; the tree is a shared value
  like a system.
- **`running` is the crux.** A multi-tick action (travel, wait) returns
  `running`; the enclosing `sequence`/`selector` short-circuits and
  resumes the same branch next frame until the action reports
  `success`/`failure`. Instant effects return `success`.
- **Composes with movement.** The tree is the *brain* (which behaviour);
  pair leaf actions with `@pierre/ecs/modules/steering` for the *muscles*
  (a `flee` leaf drives velocity via `steering.flee`).
- **Deferred nodes.** `parallel`, `cooldown`, `repeat`/`repeatUntil` are
  less-universal decorators — add them when a consumer needs one, per the
  rule of three.
