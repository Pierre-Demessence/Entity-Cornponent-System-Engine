# Ticks, frames and system order

Three separate things get called "the game loop": how often the browser repaints,
how often the simulation advances, and in what order systems run inside one
advance. The engine keeps them apart on purpose.

## A tick is an atomic unit of simulation

A tick is one pass of the simulation. `TickRunner` owns what happens in one, in
this order:

1. Build the tick context.
2. Run the scheduler.
3. `onBeforeFlush`.
4. Flush — events, lifecycle, destroys.
5. `onTickComplete`.

Two implications follow from "atomic":

- **Nothing structural is half-applied.** Queued destroys and events drain at
  step 4, so no system sees the world change shape mid-tick.
- **World swaps belong at the boundary.** Swapping scenes is done in
  `onTickComplete`, not inside a system. Emitting a tick-boundary event belongs
  in `onBeforeFlush`, so it drains in the same flush rather than waiting a tick.

## Nothing decides when a tick fires — a source does

A `TickSource` emits ticks; the runner never chooses. That separation is why the
same runner serves a turn-based game, a test that steps the sim by hand, and a
real-time game at a fixed rate.

`modules/tick` ships four:

| Source | Cadence |
| --- | --- |
| `ManualTickSource` | Caller-driven — you call it. Tests, turn-based games, lockstep. |
| `FixedIntervalTickSource` | Fixed wall-clock interval — "simulate at N Hz". |
| `AnimationFrameTickSource` | One tick per rendered frame, with real elapsed time. |
| `FixedAccumulatorTickSource` | Fixed timestep plus interpolation. |

See [`modules/tick`](../../modules/tick/) for choosing between them.

## Frames are not ticks

A browser repaints on `requestAnimationFrame`, at whatever rate the display and
the machine allow. Ticks are your choice, and the two need not match.

The mismatch is what the accumulator exists to solve. `FixedAccumulatorTickSource`
consumes real elapsed time and advances the world in fixed `dt` steps, catching
up as needed, so physics sees a constant step regardless of frame rate. It also
exposes an `alpha` — the fraction of a step left over — so rendering can
interpolate between the previous and current simulation states instead of showing
stutter at an uneven frame rate.

Duplicating the accumulator's logic inside a system would not work: it needs to
see time that no system owns.

## Order is declared, not implied

Systems never call one another. Each declares what it must run after or before,
by name:

```ts
scheduler.add({ name: 'movement', writes: [PosDef], run });
scheduler.add({ name: 'render', reads: [PosDef], runAfter: ['movement'], run });
```

The scheduler sorts with Kahn's algorithm, breaking ties by insertion order — so
the order is deterministic for a given set of declarations. It builds lazily on
the first `run()` and rebuilds when you add or remove a system. A cycle, or a
dependency on a name that does not exist, is a build-time error rather than a
silent wrong order.

### Declared access is a warning, not a guarantee

`reads` / `writes` are metadata. There is no runtime check and no cost in
production. In development the scheduler uses them to catch the failure mode that
bites later: a system that reads a component written by an earlier system, but
never declared that it needs to run after it. That code works by accident today
and breaks on the next reorder, so it warns.

Declaring what a system touches is therefore worth doing even though nothing
enforces it — it is the only thing that makes the ordering auditable.

## See also

- [`scheduler`](../../core/scheduler/) — the full ordering API.
- [`tick`](../../core/tick/) — the interfaces and the runner.
- [`modules/tick`](../../modules/tick/) — the shipped tick sources.
- [Structural changes](../structural-changes/) — what the flush at step 4 means
  for counts and caps.
