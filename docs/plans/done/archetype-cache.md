# Archetype Cache (core roadmap §3.1)

Replace the query engine's per-entity multi-store `has()` scan with an
archetype-bucketed index: group entities by their exact component/tag set and
match a query against archetype **signatures** instead of walking the smallest
store and probing every other store per entity.

- **Roadmap entry:** [core-engine-roadmap.md](../../roadmap/core-engine-roadmap.md) — §3.1, shipped and removed from the open list.
- **Ladder context:** the *cache* is the lighter middle step below full
  archetype *tables* (§3.5). It caches **which entities match**, keeping the
  per-store gather. Detail: [ecs-parallelism-and-soa-storage.md](ecs-parallelism-and-soa-storage.md#the-path-beyond-middle--storage-architecture-logged).

## Problem

`QueryBuilder[Symbol.iterator]` ([query.ts](../../../src/query.ts#L46)) iterates
the smallest store's keys, then for every candidate entity probes `has(id)` on
each other required store plus each required/excluded tag. That is
O(entities-in-smallest-store × components-in-query) per query call. With many
components and frequent queries it dominates a tick.

## Solution

An **archetype index** the world maintains incrementally:

- Each registered component **and tag** gets a stable bit (a `bigint` power of
  two — arbitrary width, no 32-component cap, and directly `Map`-keyable).
- Each entity has a **signature** = OR of the bits of the components/tags it
  holds. Entities with the same signature share an **archetype bucket**
  (`Set<EntityId>`).
- A query with required mask `R` and excluded mask `X` matches every bucket
  whose signature `s` satisfies `(s & R) === R && (s & X) === 0n`, then yields
  that bucket's entities. Cost is O(#archetypes) to select buckets +
  O(#matching entities) to iterate — the per-entity multi-store probing is
  gone. A small per-query-shape cache of the matched bucket list (invalidated
  by a structural-version counter bumped when a bucket is created/emptied)
  makes repeated identical queries O(1) to select.

The public `query` / `get` / `set` API is **unchanged**; the index is an
internal optimization. Consumers, modules, and examples need no edits.

## Design

### `src/archetype-index.ts` (new, internal — not exported from `index.ts`)

State:
- `bitOf: Map<object, bigint>` — component store **or** tag store instance → bit.
- `nextBit: bigint` — next power of two to hand out.
- `signatures: Map<EntityId, bigint>` — entity → current signature.
- `buckets: Map<bigint, Set<EntityId>>` — signature → members (never keeps an
  empty `0n` bucket).
- `structuralVersion: number` — bumped when a bucket is created or removed.

Methods:
- `registerStore(store): bigint` — assign and return the store's bit (idempotent).
- `bitOf(store): bigint | undefined` — lookup (used by `QueryBuilder`).
- `addBit(id, bit)` — set the bit; if the signature actually changes, move the
  entity between buckets. Idempotent (re-`set` of an existing component is a
  no-op, so value *replacement* never thrashes the bucket).
- `removeBit(id, bit)` — clear the bit; move buckets; drop the entity's entry
  entirely when the signature reaches `0n`.
- `removeEntity(id)` — remove from its bucket and forget its signature.
- `clear()` — wipe signatures + buckets, **keep** bit assignments (mirrors
  `world.clearAll`, which preserves registrations).
- `matching(required, excluded): Iterable<EntityId>` — version-cached bucket
  selection, then live iteration of the selected `Set`s.

### `EcsWorld` wiring ([world.ts](../../../src/world.ts))

- Hold one `ArchetypeIndex`.
- `registerComponent`: `const bit = index.registerStore(store)`, then in the
  **existing** `set`/`delete` subscriptions also maintain the index:
  - `set` → `index.addBit(id, bit)` (idempotent).
  - `delete` → **only on real removal**: `if (!store.has(id)) index.removeBit(id, bit)`
    (a value replace fires `delete` while `has(id)` is still `true`).
- `registerTag`: same, keyed on the `TagStore`, via its `add`/`delete` events.
- `destroyEntity`: after the per-store deletes drain the bits, call
  `index.removeEntity(id)` to clear any residual entry.
- `clearAll`: `index.clear()`.
- `loadJSON`: `index.clear()` **first**, then let the repopulating `store.set`
  calls rebuild it. The upfront clear is required because the preceding
  `store.clear()` emits `delete` while the row still exists (`has(id)` is
  `true`), so a stale bit would otherwise survive a reload of a non-empty world.
- `query(...defs)`: pass the index to `QueryBuilder`.

### `QueryBuilder` ([query.ts](../../../src/query.ts))

- New optional second constructor arg: `index?: ArchetypeIndex`.
- With an index (the world path): at iterate time compute
  `required = OR(bitOf(each component store) ∪ bitOf(each required tag store))`
  and `excluded = OR(bitOf(each excluded tag store))`, ask
  `index.matching(required, excluded)` for candidate ids, then build the result
  tuple with one `get()` per component store (the archetype guarantees presence,
  so no `has()` probing).
- Without an index (standalone `new QueryBuilder(stores)`, as in unit tests):
  fall back to the current smallest-store scan. Both paths must return
  identical results.

## Invariants

- Query results are **identical** to the pre-cache scan for every
  component/tag/exclusion combination (verified by a brute-force parity test).
- A component-value **replace** never changes an entity's archetype.
- An entity with no components/tags occupies no bucket.
- `clearAll` preserves bit assignments; `loadJSON` rebuilds the index via `set`.

## Tasks

- [x] `src/archetype-index.ts` — the index (signatures, buckets, matching,
      version cache).
- [x] `src/archetype-index.test.ts` — unit: bit assignment, add/remove/replace
      no-thrash, `0n` cleanup, `matching` required/excluded, structural-version
      cache invalidation.
- [x] Wire `EcsWorld`: register bits, maintain index in the existing set/delete/
      add/delete subscriptions, `destroyEntity`, `clearAll`, `query`.
- [x] Route `QueryBuilder` through the index with the scan fallback.
- [x] Parity test: random worlds, assert index-backed `world.query` equals a
      brute-force scan across many required/tag/excluded combinations.
- [x] Extend `query.test.ts` / `world.test.ts` for tag + exclusion under the
      archetype path; keep standalone-`QueryBuilder` tests green.
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test`; `npm run docs:api`
      only if the public surface changed (it should not).
- [x] Peer review loop (small model, no edits, no askQuestions) → LGTM.
- [x] Remove §3.1 from `core-engine-roadmap.md` (entry + order-list line);
      refresh the now-stale "no archetype cache" lines in
      `engine-readiness-assessment.md`; tick the §3.1 follow-up box in
      `done/ecs-parallelism-and-soa-storage.md`. Move this plan to
      `docs/plans/done/` in the final commit.

## Non-goals (stay §3.5, not this)

- No archetype **tables** / structural moves / gather-free iteration — storage
  stays sparse-set; `get()` still gathers per store.
- No generational entity ids (that is §3.2's breaking part).
