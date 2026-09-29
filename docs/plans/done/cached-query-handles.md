# Cached Query Handles + Typed Arity (core 3.8)

Roadmap entry: [core-engine-roadmap.md §3.8](../../roadmap/core-engine-roadmap.md)
(removed on delivery).
Canon: Bevy `Query` / `QueryState` (a system param resolved once, iterated
every run), Flecs cached queries (`world.query()` vs uncached `world.each()`).
Canon settles the shape; game-of-life and the 3D render passes are the
consumers.

## Problem

- **Every pass re-resolves.** Iterating a `QueryBuilder` recomputes its
  archetype masks (one `bitOf` lookup per store), spreads its change filters
  into a new array, and asks the index for matching buckets through a string
  key (`required:excluded:anyOf`). That happens whether the builder is fresh
  or has been iterated a thousand times.
- **Consumers rebuild per tick.** game-of-life's systems and the doom /
  platformer-3d / starfighter / portal render `select` callbacks call
  `world.query(...)` inside the per-tick body, so they also allocate a
  builder each pass.
- **Arity cliff.** `world.query` has typed overloads for 0–4 defs; a
  five-component query does not type-check.

## Decisions

1. **The builder is the handle.** No separate frozen type. A query resolves
   its masks, change clock and matched bucket list lazily on the first pass
   and reuses them. It re-resolves only when (a) a fluent filter method is
   called after resolution, or (b) the archetype index's structural version
   moved (a bucket appeared or emptied). Hoisting `world.query(...)` out of
   the per-tick body is the whole consumer-side change.
2. **Rename `QueryBuilder` → `Query`** everywhere in the repo (src, examples,
   website, docs). The file stays `src/query.ts`; the subpath export
   `@pierre/ecs/query` is unchanged.
3. **Variadic typing.** The five overloads collapse into one:
   `query<D extends ComponentDef<…>[]>(...defs: D): Query<ComponentValues<D>>`,
   where `ComponentValues<D>` maps a def tuple to its value tuple. It is
   exported next to `ComponentDef`.
4. **Index surface.** `ArchetypeIndex` exposes `version` (the structural
   version it already keeps) and `selectBuckets(required, excluded, anyOf)`
   (today private). The index's own string-keyed match cache stays: it still
   serves ad-hoc queries built per call.
5. **Clock validation moves to resolve time.** The "filters span different
   change clocks" error is raised on the first pass after resolution instead
   of every pass.
6. **render-scene3d resolves `select` once per world.** `Scene3DRenderer`
   called `select(world)` every frame, which forced every 3D example to
   rebuild its queries per frame. It now calls `select` on the first render
   for a world and re-iterates the returned query each frame; `select` is
   documented as building a live selection (a query, not an array snapshot).
   The doom / platformer-3d / starfighter / portal passes are hoisted by this
   with no call-site change.
7. **Out of scope:** the per-pass generator and the per-entity result tuple.
   They are the iteration protocol's cost, not resolution's; recorded under
   roadmap §3.5 (Archetype Tables), whose column loop removes them.

## Checklist

- [x] `src/archetype-index.ts`: public `version` getter and `selectBuckets`.
- [x] `src/query.ts`: rename to `Query`; lazy resolved state (masks or
      scan-fallback marker, clock, buckets + version); every fluent method
      invalidates; iterator uses cached buckets.
- [x] `src/component-store.ts`: `ComponentValues<D>`; `src/world.ts`: single
      variadic `query` signature returning `Query`.
- [x] Rename `QueryBuilder` → `Query` across `src/`, `examples/`, `website/`,
      `docs/` (excluding `docs/plans/done/` and `docs/archived/` history).
- [x] Tests: re-iteration does not re-select buckets while structure is
      unchanged; a new archetype after the first pass is picked up; a filter
      added after a pass takes effect; scan fallback still works; a
      five- and six-component query is typed (`expectTypeOf`).
- [x] Examples: hoist per-tick `world.query(...)` in game-of-life systems
      (factories that build their query in `init`); the 3D render passes via
      the render-scene3d change above, with a test and README update.
- [x] Docs: `src/query.md`, `src/world.md`, website manual mentions.
- [x] Remove §3.8 from the roadmap and the suggested order.
- [x] `npm run docs:api`, `npm run docs:usage`.
- [x] Gate: lint, typecheck, typecheck:examples, test.
- [x] Peer review (haiku, one pass).
