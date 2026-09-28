# Core review fixes

Five defects found in a whole-project review, each reproduced with a probe test
before this plan was written.

## Defects and fixes

1. **Columnar `get()` is ~7× slower than the object store on the default query
   path.** `ColumnStore.makeView` builds every view with
   `Object.defineProperty` + `Object.defineProperties`, per call, per entity.
   Measured: 50k entities, one `p.x += 1` query loop — 27 ms columnar vs 3.7 ms
   object store.
   **Fix:** cache one view per entity id in a paged array parallel to the
   sparse set. A view is already bound to its id (not its slot), so it stays
   valid across swap-remove; the cache entry is dropped on `delete` / `clear`.
   View semantics (own enumerable accessors, write-through, spread and
   `structuredClone` behaviour) are unchanged.
2. **Phase-mode scheduler warns on a correct cross-phase read.** Cross-phase
   `runAfter` edges are forbidden, yet `checkAccessOrdering` demands one: a
   `physics` writer followed by a `render` reader warns.
   **Fix:** a writer in an earlier phase is ordered by the phase list, so it
   counts as a predecessor.
3. **`destroyEntity` on a dead id re-emits `EntityDestroyed`.**
   **Fix:** store rows are still deleted (idempotent), but `EntityDestroyed` is
   emitted only when the id was alive.
4. **Every store mutation allocates a lifecycle event even with no listener**,
   and a consumer that never calls `lifecycle.flush()` grows the queue without
   bound.
   **Fix:** `EventBus.hasListeners(type)`; the world builds and emits a
   lifecycle event only when that type has a listener. An event produced while
   nothing listens is not delivered to a handler subscribed later in the same
   tick — documented on `world.lifecycle`.
5. **`flushDestroys()` is a back-compat alias** that `AGENTS.md` forbids and
   nothing calls. **Fix:** delete it; migrate its test and doc row.

## Checklist

- [x] Plan file
- [x] 1 — cached columnar views + test (view identity stable, dropped on delete/clear, swap-remove safe)
- [x] 2 — scheduler phase-aware access check + test
- [x] 3 — `destroyEntity` alive guard on the event + test
- [x] 4 — `EventBus.hasListeners` + lazy lifecycle emission + tests
- [x] 5 — remove `flushDestroys`, its test and `world.md` row
- [x] Docs: `world.md`, `event-bus.md`, `scheduler.md`, `lifecycle.ts` JSDoc
- [x] `npm run docs:api` + `npm run docs:usage` regenerated
- [x] Re-measure the columnar benchmark — 27 ms → 3.5 ms (object store: 3.2 ms)
- [x] lint + typecheck + typecheck:examples + full test suite green
- [x] Peer review — three findings (stale `non-goals.md` entry, wrong `plugin.ts` JSDoc example, held-view test gaps) fixed; re-review pass skipped at the user's request
