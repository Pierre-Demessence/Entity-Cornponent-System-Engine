# Swap worlds between ticks

Loading the next level by tearing down one world and building another is the
obvious approach, and it is exactly what a running tick cannot tolerate: a system
half-way through iterating a store would find its world replaced underneath it.
The engine's answer is to move the swap to the tick boundary and let the rest
follow from that.

## The rule first

A tick is atomic. Destroys, events and lifecycle work all drain at the end of the
tick, so a system never observes a partially-changed world. Swapping the world is
the largest possible change, so it happens at the same boundary — never inside a
system.

That is what `modules/scene-transition` packages: a queue you enqueue into during
a tick, and an applier you call between ticks.

## Enqueue, then apply

```ts
import { SceneTransitionQueue } from '@pierre/ecs/modules/scene-transition';

const transitions = new SceneTransitionQueue();

// inside a system, when the level is cleared:
transitions.enqueue(() => {
  world.clearAll();
  buildLevel(world, nextLevel);
});

// at the tick boundary — e.g. the runner's onTickComplete or your own loop:
if (transitions.applyNext())
  onLevelEntered();
```

`enqueue(applier)` takes a zero-argument callback that performs the swap;
`applyNext()` runs at most one and reports whether it did. Because the callback
takes no arguments, everything it needs — which world, which level, what to carry
over — is captured where the decision was made, not reconstructed later.

Multiple enqueues in one tick do not all fire at the same boundary: one per
boundary, in order.

## Carrying entities across

A world swap normally means new entities in a new world. When some must survive —
the player, persistent inventory, a carried companion — `transferEntities` moves
them by id:

```ts
import { transferEntities } from '@pierre/ecs/modules/scene-transition';

let current = makeLevelWorld(1);

const carried = [playerId, lanternId];
transitions.enqueue(() => {
  const next = makeLevelWorld(nextLevel);
  transferEntities(next, current, carried);
  current = next; // the runner's getWorld() returns `current`
});
```

An entity keeps its id, and the destination's id counter moves past it so later
spawns cannot collide. Values are deep-copied, so the two worlds never share an
object. Components travel only if the destination registers them; restrict the
transfer with the optional component-name list when only part of each entity
should. Tags do not travel at all — which tags follow an entity is the game's
decision, so re-add them on the destination.

## Where the boundary sits

If you drive the game with `TickRunner`, the boundary is between one
`onTickComplete` and the next tick — that hook exists for exactly this. If you
drive ticks yourself, apply transitions where you know a tick has finished and
the next has not started.

The one thing not to do is apply a transition from inside a system's `run`, even
at the end of the last system: the flush for that tick has not happened yet.

## See also

- [Ticks, frames and system order](../../concepts/ticks-and-order/) — the tick
  ceremony the boundary comes from.
- [`modules/scene-transition`](../../modules/scene-transition/) — the module.
- [`world`](../../core/world/) — `clearAll`, and how ids are allocated.
