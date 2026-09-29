# Change-Detection Query Filters (core 3.7)

Roadmap entry: core-engine-roadmap.md §3.7 (removed on delivery; follow-up optimization is §3.9 in [core-engine-roadmap.md](../../roadmap/core-engine-roadmap.md)).
Canon: Bevy `Added<T>` / `Changed<T>` (change ticks, per-system last run),
Flecs `query.changed()` (per-query tracking), Unity DOTS `WithChangeFilter`.
Canon settles the shape, so it ships with zero example consumers.

## Problem

Stores keep one `dirty` Set each, cleared once at the end of the tick. That
model cannot back a query filter:

- **Order-sensitive.** A reader scheduled before a writer never sees the
  write — the set is cleared before the reader runs again.
- **Single-reader.** Two readers of the same store share one window; a reader
  that skips a tick (future run conditions, 4.7) loses changes.
- **Uneven marking.** `set()` and a `ColumnStore` view field write mark;
  mutating the object returned by `ComponentStore.get()` does not.
- **No added/changed split**, and `delete()` marks too, so removed ids would
  leak into a "changed" result.

Nothing in `src/`, `examples/` or `website/` reads `isDirty` / `hasChanges`,
so the old API is replaced outright.

## Decisions

1. **Change ticks, per reader.** "Changed" means *changed since this reader
   last ran*, independent of schedule order and reader count.
2. **The reader is the `QueryBuilder` instance.** A system builds its query
   once and iterates it every tick. The builder owns `lastRun`.
3. **Mark on mutable access.** `getMut(id)` stamps and returns the value;
   `get(id)` is untracked. `ColumnStore` view field writes still stamp (the
   setter already runs). `markChanged(id)` stays for the columnar fast path.
4. **Removal is not a change.** `delete()` drops the entity's stamps; removal
   is observed through the lifecycle `ComponentRemoved` / `TagRemoved` events.

## Design

### Clock

`ChangeClock` — a mutable `{ tick: number }` starting at `1`, exported from a
new `src/change-clock.ts`. Every store takes an optional clock at
construction (`new ComponentStore(clock)`, `new TagStore(clock)`,
`new ColumnStore(specs, { clock })`) and exposes it as `readonly clock`; a
store built without one creates its own. `EcsWorld` owns one clock and passes
it to every store it registers. The world's stores start empty and `loadJSON`
refills them through `set()` / `add()`, so loaded entries read as added at the
load tick. `number` gives 2^53 ticks — no wraparound handling.

### Stamps

| Store | Storage | `added` stamped by | `changed` stamped by |
|---|---|---|---|
| `ComponentStore` | `Map<EntityId, number>` ×2 | `set()` on insert | `set()`, `getMut()`, `markChanged()` |
| `ColumnStore` | two `Float64Array` columns per slot, moved on swap-remove | `set()` on insert | `set()`, `getMut()`, view field write, `markChanged()` |
| `TagStore` | `Map<EntityId, number>` | `add()` when newly present | — (tags carry no data) |

Every stamp is `clock.tick`. Insert stamps both (a Bevy `Added` entity is
also `Changed`). `delete()` / `clear()` drop stamps. Re-adding after removal
counts as added again.

New surface on `ComponentStoreLike<T>`: `getMut(id)`, `markChanged(id)`,
`addedTick(id)`, `changedTick(id)` (the last two return `0` when absent), and
`readonly clock`. `TagStore` gains `addedTick(id)` and `readonly clock`.

`EcsWorld.move()` switches from `markDirty` to `markChanged`. `motion` and
`motion-3d` switch their fast-path `markDirty` to `markChanged`.

### Query filters

```ts
const moved = world.query(Position).changed(Position); // built once
// per tick:
for (const [id, pos] of moved) { … }
```

- `added(store)` — component or tag store; matches `addedTick(id) > since`.
- `changed(store)` — component store; matches `changedTick(id) > since`.
- Each call adds one filter; filters AND together. The store is implicitly
  required (as with `withComponent`).
- At the **start** of each iteration that has at least one change filter:
  `since = lastRun; lastRun = clock.tick; clock.tick++`. Writes made during or
  after the iteration stamp with the new tick and are seen next time.
  `run()`, `count()` and `first()` all consume the window.
- A new builder has `lastRun = 0`, so its first pass sees every entity as
  added and changed (Bevy's first-run behavior).
- The filter is a per-entity stamp check after archetype matching (index path)
  or inside `passesFilters` (scan path). Iterating only the changed set is a
  later optimization, not part of this plan.
- The clock comes from the filtered stores. If they hold different clocks
  (stores from two worlds), iteration throws.

### Removed

`isDirty`, `hasChanges`, `clearDirty`, `markDirty` (renamed `markChanged`) on
all three stores and `ComponentStoreLike`; `EcsWorld.clearAllDirty()`; step 7
of the `TickRunner` ceremony. Stamps need no per-tick reset.

## Edge cases

| Case | Behavior |
|---|---|
| Reader before writer in schedule | Sees the write on its next run |
| Two queries over one store | Independent windows |
| Query skipped for N ticks | Sees everything since its last iteration |
| Fresh `world.query(...)` every tick | Sees everything every time — documented as misuse in `query.md` |
| `getMut` without writing | Reported as changed (over-report, never under-report) |
| Delete then re-add in one window | Reported as added |
| Delete only | Not reported; use lifecycle events |
| Write during own iteration | Stamped with the new tick, seen next iteration |
| Mixed clocks in one query | Throws |
| `loadJSON` / `fromSerialized` | Entries read as added at load tick |

## Testing

Unit tests next to source (TDD, red first):

- `change-clock.test.ts` — tick starts at 1, advances only on a filtered iteration.
- `component-store.test.ts` / `column-store.test.ts` — stamps on insert,
  replace, `getMut`, `markChanged`, view write (column), cleared on delete,
  stamps follow a swap-remove (column), shared clock via constructor.
- `component-store.test.ts` (tags) — `addedTick` on add, not on repeat add,
  cleared on delete.
- `query.test.ts` — each edge-case row above, on both the index path and the
  standalone scan path.
- `world.test.ts` — world-registered stores share the world clock; `move()`
  stamps changed.
- `tick-runner.test.ts` — ceremony no longer calls `clearAllDirty`.
- Motion modules — fast-path integration reports moved entities as changed.

## Checklist

- [x] `ChangeClock` + tests
- [x] `ComponentStore` stamps, `getMut`, `markChanged`, clock option; remove dirty API
- [x] `ColumnStore` stamp columns (swap-remove aware), view-write stamping; remove dirty API
- [x] `TagStore` added stamps; remove dirty API
- [x] `ComponentStoreLike` interface update
- [x] `EcsWorld` owns clock, passes it to registered stores; `move()` → `markChanged`; remove `clearAllDirty`
- [x] `TickRunner` drops step 7
- [x] `QueryBuilder.added()` / `.changed()` with per-instance window, both paths
- [x] `motion` / `motion-3d` → `markChanged`
- [x] Migrate every in-repo caller (`src/`, `examples/`, `website/`, `scripts/`)
- [x] Docs: `src/component-store.md`, `src/query.md`, `src/world.md`, `src/tick.md`, motion READMEs, `README.md`, `website/manual/concepts/{glossary,ticks-and-order,structural-changes}.md`
- [x] Remove 3.7 from `docs/roadmap/core-engine-roadmap.md` and renumber its suggested order
- [x] `npm run docs:api` + `npm run docs:usage`
- [x] Gate green: lint, typecheck, tests
- [x] Peer review (haiku, one pass)
- [x] Move this plan to `docs/plans/done/` in the final commit
