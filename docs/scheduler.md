# Scheduler (`src/ecs/scheduler.ts`)

A DAG-based system scheduler that topologically sorts systems based on
declared dependencies.

## Interface

```typescript
interface SchedulableSystem<TCtx> {
  readonly name: string;
  readonly runAfter?: readonly string[];
  readonly runBefore?: readonly string[];
  init?(ctx: TCtx): void;     // one-time setup before first run
  dispose?(ctx: TCtx): void;  // teardown after remove / disposeAll
  run(ctx: TCtx): void;
}
```

## API

| Method | Description |
|--------|-------------|
| `add(system)` | Register a system (invalidates sort cache) |
| `remove(name)` | Remove a system by name. Defers `dispose(ctx)` until the next `run(ctx)` if the system had been initialized. |
| `build()` | Topologically sort; returns sorted array |
| `run(ctx)` | Build (if needed) then run all systems in order. Drains any pending `dispose`s first, then lazy-inits any uninitialized systems before their first run. |
| `disposeAll(ctx)` | Immediately dispose every initialized system (plus any deferred disposes). Use at shutdown. |
| `[Symbol.iterator]()` | Iterate sorted systems (for custom run loops) |
| `order` | Getter: sorted system names |
| `size` | Number of registered systems |

## Lifecycle Hooks

Systems may opt into `init(ctx)` / `dispose(ctx)` for symmetric setup and
teardown. `init` is called by the scheduler once, before the system's first
`run` in a given lifecycle. `dispose` is invoked by the scheduler either on
the next `run` after `remove(name)`, or synchronously via
`disposeAll(ctx)`.

Both hooks receive the tick context, so systems can subscribe to
`ctx.events`, register caches keyed off `ctx.world`, etc., and tear them
down symmetrically.

## Algorithm

- **Kahn's algorithm** with stable insertion-order tiebreaking.
- Lazy build: auto-sorts on first `run()` or iteration; invalidated by
  `add()` / `remove()`.
- Cycle detection with clear error messages listing stuck systems.
- Duplicate name detection at build time.

## Dependency Declaration

Systems declare dependencies via `runAfter` (run after named systems)
and `runBefore` (run before named systems). Both reference system names.
Unknown system names in dependencies cause build-time errors.
