# Event Bus

A generic queue-and-flush pub/sub system that decouples event producers
from consumers. Supports handler priorities, event consumption, and
nested flush with depth limiting.

## How It Works

1. Producers call `bus.emit(event)` during their turn — events queue.
2. After all systems run, the engine calls `bus.flush()`.
3. Flush dispatches each batch of queued events to handlers, ordered by
   priority (higher = runs first). If handlers emit new events during
   flush, those are processed in subsequent batches within the same
   flush call, up to `maxDepth` (default 3).

This avoids mid-tick side effects: all game state mutations from systems
complete before any event handler runs.

## API

| Method | Description |
|--------|-------------|
| `on(type, handler, priority?)` | Register a handler. Returns an unsubscribe function. Higher priority runs first (default 0). |
| `off(type, handler)` | Remove a handler |
| `emit(event)` | Queue an event |
| `flush(maxDepth?)` | Dispatch all queued events. Processes handler-emitted events in subsequent batches up to `maxDepth` (default 3). |
| `clear()` | Drop every queued event without dispatching. Handlers are preserved. Used by `EcsWorld.clearAll()`; call directly when resetting application-level event buses. |

## EventContext

Handlers receive `(event, ctx)` where `ctx` provides:

| Property / Method | Description |
|---|---|
| `ctx.consumed` | `boolean` — whether `stopPropagation()` has been called |
| `ctx.stopPropagation()` | Skip remaining handlers for this event |

## Handler Priorities

Handlers are sorted by priority in descending order. Higher priority
values run first (similar to CSS z-index). Handlers with equal priority
fire in registration order. Default priority is 0.

```typescript
bus.on('DamageTaken', shieldHandler, 100);  // runs first
bus.on('DamageTaken', logHandler, 0);       // runs second
```

## Event Consumption

A handler can call `ctx.stopPropagation()` to prevent subsequent
handlers from receiving the event. Each event gets its own context.

```typescript
bus.on('DamageTaken', (event, ctx) => {
  if (shieldAbsorbs(event)) ctx.stopPropagation();
}, 100);
```

## Nested Flush

Events emitted by handlers during flush are processed in subsequent
batches within the same flush call. If a handler emits → that triggers
another handler which emits → the chain continues up to `maxDepth`
batches (default 3). Exceeding the limit logs a warning and defers
remaining events to the next explicit flush.

## Generic Typing

`EventBus<TEvent>` is parameterized by the event union type. Handlers
receive narrowed event types via a mapped type:

```typescript
bus.on('SomeEvent', (event, ctx) => {
  // event is narrowed to SomeEvent, not the full union
});
```

## See also

- [EcsWorld](world.md) - owns the event bus and flushes it in the game loop.
- [Scheduler](scheduler.md) - drains events between system phases.

