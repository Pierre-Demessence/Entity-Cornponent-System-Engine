# New core-engine roadmap entries — completeness and capability

## Why

A review of the core (`src/*.ts`) against the 28 examples found the engine's
query machinery has **no production consumer**:

- `world.query(...)` has **zero** call sites under `examples/**` and under
  `src/modules/**` (non-test). The token `query` appears in `examples/**` three
  times, all in comments.
- The dominant consumer pattern is tag-store iteration — 74
  `for (const … of <receiver>.getTag(…))` loops — followed by per-store
  `get(id)` probes. `QueryBuilder` cannot express that shape at all, because `world.query`
  takes only `ComponentDef`s (`src/world.ts:281-284`) and the builder's filters
  are `without(tags)` / `withTag(tags)` (`src/query.ts:125,131`).
- The archetype index is therefore *maintained* on every store mutation
  (`src/world.ts:318-330`) and never *read* outside its own tests.

So the seven entries below are not a wish list: each closes a hole that either
keeps the shipped query path unreachable, or leaves the entity/scheduler surface
incomplete next to canonic engine behaviour.

## Decision — reopen Tiers 1 and 2

Entry IDs are stable references and a gap in the numbering means the entry
shipped. Today only Tiers 3 (Performance & Large Scale) and 4 (Extensibility &
Developer Experience) survive; Tiers 1 (Critical Foundations) and 2 (Robustness
& Scale) emptied out and were deleted.

Most of what follows is neither performance nor developer experience. Filing it
under Tier 3 would repeat the mislabelling the module backlog's conventions warn
against — a status that "reads as the opposite claim". So:

- **Tier 1 → Critical Foundations (reopened).** 1.2 shipped an *Entity Query
  DSL* and 1.3 a scheduler; both are foundations with holes, not finished work.
  Listing the holes where the foundation lives states that plainly.
- **Tier 2 → Robustness & Correctness (reopened, renamed).** The old name was
  "Robustness & Scale"; scale now lives in Tier 3, so the tier is renamed to
  what its remaining work is about.
- **Tier 3 → Performance & Large Scale.** Change detection lands here because
  its mechanism (dirty flags) and its payoff (skip unchanged work) are the same
  as shipped 3.3's.
- **Tier 4 → Extensibility & Developer Experience.** System run conditions are
  a scheduler ergonomic, so they sit beside 4.6.

Alternative rejected: cramming the capability work into Tier 3/4 to avoid
reopening tiers. It would leave "query predicates" filed under *Performance*
with no perf claim to make, which is the failure this repo's status vocabulary
exists to prevent.

## Entries

| # | Entry | Scope | Evidence |
|---|---|---|---|
| 1.4 | **Query predicate vocabulary** | Tag-only/component-less queries (`[EntityId]` results), component-level exclusion, optional components, any-of. Canon: Bevy `With`/`Without`/`Option<&T>`/`Or`, Unity DOTS `WithNone`/`WithAny`, Flecs `not`/`optional`/`or`. | `src/world.ts:281-284`, `src/query.ts:125,131`; 74 tag-store loops in `examples/**` |
| 1.5 | **Entity liveness / existence API** | `isAlive(id)`, entity count, or an explicit live-entity registry. Also the prerequisite for 3.2's recycled ids. Canon: Bevy `Entities`, Unity `EntityManager.Exists`, Flecs `ecs_is_alive`, EnTT `valid`. | `src/world.ts:127` (`nextId++`, nothing tracks liveness); workaround at `examples/river-raid/src/game.ts:304` |
| 2.5 | **Deferred structural changes (command buffer)** | Queue add/remove-component and create, not just destroy, and apply at the tick flush; a DEV assertion against mutating a store mid-iteration. Canon: Bevy `Commands`, Unity DOTS `EntityCommandBuffer`, Flecs deferred ops. | only `queueDestroy` exists (`src/world.ts:300`); "not safe" is documentation, not a guard (`src/world.md`); river-raid destroys mid-loop (`examples/river-raid/src/systems.ts:276-378`) |
| 2.6 | **Spatial integration generalized** | Make `enableSpatial` / `move` / `spatial` generic in `TPos` and allow more than one indexed set per world; the `SpatialStructure<TPos>` interface already is generic. Distinct from the backlog's `QuadTree`/`BVH` *backends*. | `src/world.ts:26,147-166,268,373` are hard-wired to `{x,y}` + `HashGrid2D`; the 4 3D examples hand-roll |
| 3.7 | **Change-detection query filters** | An `Added`/`Changed` filter over the shipped dirty tracking. Shape gate first: mutation through an object-store `get(id)` is invisible unless `markDirty` is called, while the columnar view setter auto-marks — so the contract needs settling before a filter can be honest. Canon: Bevy `Added`/`Changed`, Unity `WithChangeFilter`. | flags at `src/component-store.ts:77-85,203-208`; auto-mark at `src/column-store.ts:106`; zero example uses of the dirty API |
| 3.8 | **Cached query handles + typed arity beyond four** | A reusable query handle (no builder + mask-key allocation per call) and typed results past four component defs. Canon: Bevy system params, Flecs cached queries. | `src/world.ts:281-285`; `src/query.ts:29-44`; `src/archetype-index.ts` `selectBuckets` string key |
| 4.7 | **System run conditions / enable flags** | A `condition`/`enabled` field on `SchedulableSystem`, evaluated by the scheduler before `run`. Canon: Bevy `run_if` / `in_state`, Unity DOTS `Enabled` / system groups. | `src/scheduler.ts:7-36` has no such field; consumers guard inside `run(ctx)` |

## Tasks

- [x] 1. Rewrite the roadmap intro for the revived tiers and the live ID list.
- [x] 2. Add `## Tier 1 — Critical Foundations` with 1.4 and 1.5.
- [x] 3. Add `## Tier 2 — Robustness & Correctness` with 2.5 and 2.6.
- [x] 4. Add 3.7 and 3.8 to the existing Tier 3.
- [x] 5. Add 4.7 to the existing Tier 4.
- [x] 6. Rework `## Suggested Implementation Order` over the new set.
- [x] 7. Verify: `npm run lint`, `npm run typecheck`, `npm test` (the status-doc
      and docs-link suites cover the roadmap file).
- [x] 8. Peer review — waived by the maintainer; the verification gates above
      stand as the check.

## Verification

- The guard suite is unaffected; the roadmap is prose, so the load-bearing
  checks are `scripts/docs.test.ts` (links + status-doc entry shape) and the
  markdown conventions in `~/.copilot/instructions/markdown.instructions.md`.
- Every entry carries its canonical reference and a `src` citation, so a reader
  can re-verify rather than trust.

## Notes

- Nothing here duplicates tracked work: `parallelFor` over shared columns,
  `QuadTree`/`BVH` backends, `modules/debug`, and the app-host helper already
  live in the module backlog; entity hierarchy, a visual editor, plugin
  sandboxing, and content hot-reload are already declined in `non-goals.md`.
- Scope is deliberate: the entries record shapes and evidence. Choosing what to
  build next stays a separate, scheduling decision.
