# Tick

The tick story is a two-layer design: a **core interface and runner**
that define the per-tick ceremony, and **module implementations** that
decide *when* ticks fire.

## Core Interfaces (`packages/ecs/src/tick-source.ts`)

`TickInfo` + `TickSource` describe the source of ticks (discrete or
continuous). A `TickSource` emits `TickInfo` payloads; how often, and
whether wall time is involved, is entirely up to the implementation.

Import via `@pierre/ecs/tick-source`.

## `TickRunner` (`packages/ecs/src/tick-runner.ts`)

`TickRunner` drives the universal per-tick ceremony:

1. build `ctx`
2. run scheduler
3. `onBeforeFlush` hook
4. flush events / lifecycle / destroys / dirty
5. `onTickComplete` hook

A tick is **atomic**. Consumers queue world swaps between ticks via
`onTickComplete`, and emit tick-boundary events (e.g. `TurnCompleted`)
via `onBeforeFlush` so they drain in the same flush.

Import via `@pierre/ecs/tick-runner`.

## Implementations

Concrete `TickSource` implementations live under
`packages/ecs/src/modules/tick/`. See
[`src/modules/tick/README.md`](../src/modules/tick/README.md) for the
current implementations (`ManualTickSource`, `FixedIntervalTickSource`)
and guidance on which to pick.
