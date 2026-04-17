# Scheduler (`src/ecs/scheduler.ts`)

A DAG-based system scheduler that topologically sorts systems based on
declared dependencies.

## Interface

```typescript
interface SchedulableSystem<TCtx> {
  readonly name: string;
  readonly runAfter?: readonly string[];
  readonly runBefore?: readonly string[];
  run(ctx: TCtx): void;
}
```

## API

| Method | Description |
|--------|-------------|
| `add(system)` | Register a system (invalidates sort cache) |
| `remove(name)` | Remove a system by name (invalidates sort cache) |
| `build()` | Topologically sort; returns sorted array |
| `run(ctx)` | Build (if needed) then run all systems in order |
| `[Symbol.iterator]()` | Iterate sorted systems (for custom run loops) |
| `order` | Getter: sorted system names |
| `size` | Number of registered systems |

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
