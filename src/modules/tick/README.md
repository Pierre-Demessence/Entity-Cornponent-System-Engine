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

## `AnimationFrameTickSource` — variable cadence

Time-driven tick source that fires once per `requestAnimationFrame`
(typically the display refresh rate). Suitable for:

- Render loops where the game draws on every frame.
- Edge-clearing for input that wants per-frame resolution.
- Variable-rate simulations that integrate with `deltaMs`.

Emits `TickInfo { kind: 'variable', deltaMs, tickNumber }`, where `deltaMs` is
the measured wall-clock interval between frames (`0` on the first tick, since
there is no previous frame to measure against). Frames are not delivered
while the tab is backgrounded on most browsers — `requestAnimationFrame`
callbacks are simply not invoked. Consumers that need catch-up semantics
should layer a fixed accumulator on top.

`start()` / `stop()` are idempotent; `stop()` cancels the pending rAF and
resets the timing baseline, so the next `start()` begins cleanly.

## Choosing between them

| Situation | Pick |
|---|---|
| Turn-based game, or tests stepping the sim | `ManualTickSource` |
| Real-time prototype, "simulate at N Hz" | `FixedIntervalTickSource` |
| Headless / lockstep / replays | `ManualTickSource` |
| Need precise wall-time deltas | `AnimationFrameTickSource` |

## Future

A fixed-timestep accumulator with interpolation is the `modules/tick` V2
backlog entry, marked **ready** — the shape is canon (Godot
`_physics_process`, Unity `FixedUpdate`, Bevy `FixedUpdate`), so it waits on a
build slot, not on a consumer.

Import via `@pierre/ecs/modules/tick`.
