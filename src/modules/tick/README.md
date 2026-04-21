# `@pierre/ecs/modules/tick`

Concrete `TickSource` implementations. The `TickSource` interface and
`TickRunner` themselves live in core — see
[`docs/tick.md`](../../../docs/tick.md).

## `ManualTickSource` — caller-driven

Produces a tick only when `tick()` is invoked. Suitable for:

- Turn-based games (one tick per player input).
- Tests (step the simulation programmatically).
- Headless simulations: AI training, replays, server-authoritative
  multiplayer, deterministic lockstep.
- REPL/debug harnesses.

`start()` / `stop()` are no-ops — there is no internal timer to toggle;
they exist for interface parity with time-driven sources.

Emits `TickInfo { kind: 'discrete', tickNumber }`.

## `FixedIntervalTickSource` — fixed cadence

Time-driven tick source that fires at a fixed interval via
`setInterval`. Suitable for:

- Real-time prototypes (arcade games, sandboxes) that want a simple
  "simulate at N Hz" timer without building a fixed-step accumulator.
- Any consumer where drift under tab-throttling is acceptable.

Emits `TickInfo { kind: 'fixed', deltaMs: intervalMs, tickNumber }`.
`deltaMs` is the nominal interval, not the measured wall time — callers
that need wall-time accuracy should use an rAF-driven source instead.

`start()` and `stop()` are idempotent; calling either repeatedly is a
no-op in the already-started/stopped state. Unsubscribed handlers stop
receiving ticks, but the interval timer remains active until `stop()`
is explicitly called — callers are responsible for stopping the source.

The default pick for real-time action prototypes.

## Choosing between them

| Situation | Pick |
|---|---|
| Turn-based game, or tests stepping the sim | `ManualTickSource` |
| Real-time prototype, "simulate at N Hz" | `FixedIntervalTickSource` |
| Headless / lockstep / replays | `ManualTickSource` |
| Need precise wall-time deltas | Neither — use an rAF-driven source (not yet shipped) |

## Future

Variable-step and hybrid (rAF-driven with fixed-step accumulator)
sources may ship when a real driver surfaces. Until then, build them in
the consumer per the Rule-of-Three policy in
[`docs/extending-the-engine.md`](../../../docs/extending-the-engine.md).

Import via `@pierre/ecs/modules/tick`.
