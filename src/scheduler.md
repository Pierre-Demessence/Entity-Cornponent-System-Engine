# Scheduler

A DAG-based system scheduler that topologically sorts systems based on
declared dependencies.

## Interface

```typescript
interface SchedulableSystem<TCtx> {
  readonly name: string;
  readonly phase?: string;    // required when scheduler has phases
  readonly runAfter?: readonly string[];
  readonly runBefore?: readonly string[];
  readonly runIf?: (ctx: TCtx) => boolean; // skip this pass when false
  readonly reads?: readonly ComponentRef[];  // DEV-mode ordering check
  readonly writes?: readonly ComponentRef[]; // DEV-mode ordering check
  init?(ctx: TCtx): void;     // one-time setup before first run
  dispose?(ctx: TCtx): void;  // teardown after remove / disposeAll
  run(ctx: TCtx): void;
}
```

`ComponentRef` is any object with a `name: string` — a `ComponentDef<T>`
satisfies it, so systems typically just pass the same definitions they
register with the world.

## Constructor

```typescript
new Scheduler<TCtx>({ phases?: readonly string[] } = {})
```

- **No options** — legacy mode. Systems must NOT declare a `phase`;
  ordering is pure `runAfter` / `runBefore` DAG sort.
- **`phases: [...]`** — phase mode. Every system must declare a `phase`
  from the list, and `runAfter` / `runBefore` must stay within the same
  phase. Systems run phase-by-phase in the declared order;
  within a phase, they DAG-sort normally.

Phase names are opaque strings — the scheduler attaches no meaning to
them. The core ships no defaults. Apps pick the vocabulary that suits
them. A turn-based game might pick `['input','logic','render']`, a
real-time one might pick `['input','physics','post-physics','render']`,
Snake might pick `['tick','render']`.

## API

| Method | Description |
|--------|-------------|
| `add(system)` | Register a system (invalidates sort cache) |
| `remove(name)` | Remove a system by name. Defers `dispose(ctx)` until the next `run(ctx)` if the system had been initialized. |
| `build()` | Topologically sort; returns sorted array |
| `run(ctx)` | Build (if needed) then run all systems in order. Drains any pending `dispose`s first, lazy-inits any uninitialized systems, and skips systems whose gate is closed (see [Run Conditions](#run-conditions)). |
| `setEnabled(name, enabled)` | Switch a system on or off. Throws on an unknown name. |
| `isEnabled(name)` | Whether a system is switched on. |
| `setPhaseEnabled(phase, enabled)` | Switch a whole phase on or off (phase mode only). Throws on an unknown phase. |
| `isPhaseEnabled(phase)` | Whether a phase is switched on. |
| `shouldRun(system, ctx)` | The gate `run` applies to a system this pass — for custom run loops. |
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

## Run Conditions

Three gates decide whether a system runs in a given pass. It runs only when
all three are open:

1. **Its own flag** — `setEnabled(name, false)` switches it off until
   `setEnabled(name, true)`. `remove(name)` clears the flag, so a re-added
   system starts enabled.
2. **Its phase's flag** — in phase mode, `setPhaseEnabled(phase, false)`
   switches off every system in that phase without touching their own flags.
3. **Its `runIf(ctx)`** — evaluated with the live context immediately
   before the system would run, so a system earlier in the same pass can
   open or close it. It is only called when both flags are on.

```typescript
scheduler.add({
  name: 'fuel',
  runAfter: ['collision'],
  runIf: ctx => !ctx.dying && !ctx.gameOver,
  run: ctx => { /* ... */ },
});

scheduler.setPhaseEnabled('physics', false); // pause
```

Gates do not affect `init`: a new system is initialized on the next `run`
even if it is skipped, so setup such as event subscriptions never depends
on the first pass's state. They do not affect ordering or the DEV
access-ordering check either; both are computed over every registered
system. Compose predicates with plain `&&`, `||` and `!`.

A custom run loop over `[Symbol.iterator]()` sees every system; call
`shouldRun(system, ctx)` to apply the same gates `run` does.

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

## Declared Component Access (DEV-mode check)

Systems may optionally declare the components they `reads` / `writes`.
This is metadata only — there is no runtime access check and no
production overhead. In DEV mode, `build()` scans the sorted order and
emits a `console.warn` whenever a system reads a component written by
an earlier system it does NOT declare (directly or transitively via
`runAfter`/`runBefore`) a dependency on. In phase mode, a writer in an
earlier phase never triggers the warning: the phase list already orders it.

The intent is to catch implicit "works by accident" ordering before it
breaks on a future reorder. Example:

```typescript
const Position = { name: 'Position', /* ... */ };

scheduler.add({ name: 'movement', writes: [Position], run: ... });
scheduler.add({ name: 'render',   reads:  [Position], runAfter: ['movement'], run: ... });
```

Forgetting `runAfter: ['movement']` on the reader would trigger:

```
[ecs/scheduler] System "render" reads component "Position" written by
"movement" earlier in the sort order, but "render" does not declare
runAfter "movement" (directly or transitively).
```

This is a foundation for future parallel-execution scheduling, but it's
useful on its own for documenting and policing data flow between systems.

## See also

- [Tick](tick.md) - `TickRunner` drives the scheduler's `run(ctx)` each tick.
- [EcsWorld](world.md) - provides the per-tick context passed to systems.

