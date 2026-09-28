# Troubleshooting

The failures below are the ones the engine's design makes easy to hit, and each
one looks like a bug somewhere else. Most of them are a single rule being broken.

## "I destroyed an entity and it is still there"

Destruction is deferred, not immediate — on purpose. `destroyEntity` removes an
entity from every store at once, which is exactly the thing that is not safe to
do while a system is iterating one. `queueDestroy` enqueues instead, and the
queue drains once per tick.

- `queueDestroy(id)` is deduped and safe to call repeatedly.
- `flushDestroys()` drains it — the contract is *after systems finish iterating*.
- `endOfTick()` runs `flushDestroys()` then the lifecycle flush in one pass, so
  subscribers see the final entity set. `TickRunner` already calls this.

So within the tick that queued it, the entity is still queryable, and any count
of live entities is a count from before the flush. If a system needs a live
number — a budget, a cap — flush first and count, or keep your own counter.
Calling `destroyEntity` directly is fine only when you are not iterating.

## "Collision stopped matching after I moved something"

Positions must change through `world.move(id, x, y)`. A direct write to the
position component updates the store and leaves any spatial index believing the
old position, so queries keep returning the entity at wherever it used to be.

The same applies to any component a spatial structure is tracking: the index is
only as current as the writes it is told about.

## "`enableSpatial` threw, or a second call did nothing"

`enableSpatial` may be called **once per world** — it installs the world's
spatial structure. A second call is not a reconfigure; set it up once, at
startup, for the position component the engine should index.

## "Registering a component threw"

Component and tag names must be unique per world, and `registerComponent` throws
on a duplicate name. Two definitions that both call themselves `position` are a
conflict even if they describe different data — the second registration is
refused rather than silently shadowing the first.

## "Loading a save produced the wrong components"

`loadJSON` restores registration *order*, but it does not create stores. The
caller registers the same schemas first — in any order, as long as they are all
there — and only then loads. A missing registration shows up as data that
silently does not arrive.

## "It only works because the systems happen to run in that order"

That is the failure the scheduler's declared access is designed to catch. In
development, a system that reads a component written by an earlier system without
declaring a dependency on it logs a warning: the code is relying on an order it
never asked for, and the next `runAfter` edit breaks it.

The fix is to declare it, not to reorder by hand:

```ts
scheduler.add({ name: 'movement', writes: [PosDef], run });
scheduler.add({ name: 'render', reads: [PosDef], runAfter: ['movement'], run });
```

`reads` / `writes` are metadata — no runtime check, no production cost — so
declaring them is the only thing that makes ordering auditable.

## "It got slower as I added entity kinds"

A query matches archetype buckets by signature, so the cost tracks the number of
*distinct component sets*, not the number of entities. An entity whose component
set is one of a kind is a bucket of one, and a system that adds a per-entity
marker component is building one bucket per entity.

Ten thousand identical entities are cheap. Ten thousand subtly different ones are
not. See [Structural changes](../../concepts/structural-changes/).

## "It is slow for a while after a hitch"

With a fixed timestep, a long frame earns several catch-up steps, and a slow
catch-up step earns more next frame. `maxStepsPerFrame` caps this, dropping time
the simulation still owed rather than carrying it — running briefly slow beats
never recovering. If you see this, lower the cap before lowering the timestep.

## Where else to look

- [Ticks, frames and system order](../../concepts/ticks-and-order/) — the ceremony
  and the ordering rules behind several of the above.
- [`world`](../../core/world/) — the destroy, flush and spatial rules in full.
- [`scheduler`](../../core/scheduler/) — dependency declaration and the dev-mode
  warning.
- [Watch frame time](../debug-overlay/) — turning "it feels slow" into a number.
