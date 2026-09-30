# Entity Id Recycling with Generational Handles (core-engine roadmap 3.2)

Recycle destroyed entity ids so the id space stays bounded under
spawn/despawn churn (projectiles, particles, summons), and pack a generation
counter into every id so a stale handle to a destroyed entity never resolves
to the entity that reused its slot (the ABA problem).

Canon (unanimous, so **Ready** at 0 consumers): every major ECS recycles
indices behind a generation check and represents the handle as a packed
**value**, never a heap object. Bevy `Entity` (u32 index + u32 generation),
flecs (32-bit index + 16-bit generation), EnTT (20-bit entity + 12-bit
version in a u32), Unity DOTS `Entity { Index, Version }` struct, bitECS
(`withVersioning(bits)` splits a 32-bit number id between index and
version; the default is 12 version bits).

## Problem

- `createEntity` / `queueSpawn` are `nextId++`, so ids are never reused.
  Every id ever spawned grows `ColumnStore`'s paged sparse set (one
  `Int32Array` page per 4096 ids, never freed) and its view-cache pages.
  With 1000 spawns/s, that's unbounded memory growth for as long as the
  session runs.
- `destroyEntity` calls `delete` on **every registered store and tag**,
  O(registered stores) per destroy, even when the entity holds two
  components.
- Reusing ids without a generation lets a held stale id (an AI target, a
  `pile` member, an `attach` carrier) silently point at an unrelated new
  entity.
- `EntityId` is a bare `number` alias, so the type system can't catch an id
  mixed up with a count, a store slot, or a coordinate.

## Decisions

### D1 — `EntityId` is a branded 30-bit packed number

`id = generation * 2^22 + index` (equivalently `(generation << 22) | index`):

- `index`: 22 bits, so up to **4,194,304 concurrently live entities**.
- `generation`: 8 bits, so 256 uses per index (see D2).
- 30 bits total, so every id stays within V8's small-integer range
  (`< 2^30`). Ids never become heap-allocated numbers when they're stored
  in a `Map`, `Set`, array, or query tuple, and they fit `Int32Array` and
  shared memory.
- Generation 0 sits in the high bits, so a fresh world still hands out
  `0, 1, 2, …`.

Rejected layouts:

- **Heap object `{ index, generation }`**: one allocation per handle (the
  GC pressure 3.2 removes), `===` and Map/Set keying break, and it can't
  live in typed arrays.
- **53-bit safe integer (32 + 21)**: once an index is reused, its ids go
  beyond `2^30` and can allocate on every Map/Set use in hot paths.
- **32-bit (bitECS-style 24 + 8)**: ids above `2^30` still allocate, so it
  pays both the cap and the allocations.
- **30-bit 20 + 10**: a 1M live cap is too tight for the stress example.

The bit split is internal: everything reads ids through `entityIndex` /
`entityGeneration`, so retuning the split later means changing the
constants (only save payloads notice).

**Branded type**:
`type EntityId = number & { readonly [entityIdBrand]: true }`, where
`entityIdBrand` is a `declare const … unique symbol` (type-only, with zero
runtime cost). A plain `number` no longer type-checks as an `EntityId`, so
ids come only from the world (`createEntity`, `spawn`, `queueSpawn`,
queries, lifecycle events), from `packEntityId`, or from deserialization.
Reading an id as a number (arithmetic, array index, template literal) still
works, because the brand narrows `number` and doesn't hide it.

**Consequence**: `examples/stress-storage`'s entity slider maximum drops
from 10M to 4M.

### D2 — Recycling policy: LIFO free list, retire on generation saturation

- Destroy bumps the index's generation and pushes the index onto a free
  stack. Create pops from the stack; if it's empty, it takes `highWater++`.
  LIFO keeps the live index range dense, so sparse-set pages stay compact
  (this matches EnTT and flecs).
- An index whose generation reaches 255 is **retired**: it's never reused,
  so ABA is impossible rather than improbable. Budget: about
  `4M × 255 ≈ 10^9` spawns per world before the index space runs out.
  That's roughly 12 days of continuous play at 1000 spawns/s, and
  `clearAll` / `loadJSON` reset it. Allocating beyond the budget throws a
  clear error rather than wrapping.

### D3 — Drop "stores mark inactive, queries skip inactive"

The roadmap's sketch keeps destroyed rows in stores and filters them in
queries. That's declined: it adds a liveness check to every query pass, and
`ColumnStore` deletes by swap-remove, which is already allocation-free. The
allocation that actually matters is the unbounded page growth, which D2
fixes. Record this under **Superseded** in
[non-goals.md](../../roadmap/non-goals.md).

### D4 — No null-entity sentinel

Bevy `Entity::PLACEHOLDER`, DOTS `Entity.Null`, and EnTT `entt::null` exist
because their languages have no cheap optional. In TypeScript,
`EntityId | undefined` is the idiom, and in-repo modules already use it.
Record this under **Declined** in non-goals.

## Design

### `src/entity-id.ts`: handle type and helpers (public)

- Branded `EntityId` (D1).
- `entityIndex(id): number` (`id & INDEX_MASK`) and
  `entityGeneration(id): number` (`id >>> 22`).
- `packEntityId(index, generation): EntityId`: the single sanctioned
  `number → EntityId` cast. It throws outside the valid ranges.
- `formatEntityId(id): string`: prints `5v1` for debugging and warning
  messages (world `requires` warnings use it).
- Constants `ENTITY_INDEX_BITS = 22`, `ENTITY_INDEX_MAX`,
  `ENTITY_GENERATION_MAX = 255`.
- `isEntityId(value): value is EntityId` (a well-formed id, not whether any
  world holds it) and, in `#validation`, `asEntityId(value, label)` for
  decoding. The store and `pile` deserializers and `entityAtPoint` use them,
  so decoding never needs a raw cast.

### `src/entity-allocator.ts`: `EntityAllocator` (core-internal)

- State: `generations: Uint8Array` (grown by doubling, per index), a
  per-index state (free / reserved / live / retired), `free: number[]`
  (LIFO stack), `highWater`, `liveCount`.
- `allocate(): EntityId` (reserved), `activate(id)` (reserved → live),
  `release(id): boolean` (a no-op returning `false` for a stale or dead
  id), `isAlive(id)` (live state and matching generation),
  `live(): IterableIterator<EntityId>`, `clear()`.
- `claim(id)` for `transferEntity`:
  - index beyond `highWater`: extend, and push the skipped indices onto the
    free list.
  - index free in the target: remove it from the free list and adopt the
    id's generation, only if that generation is ≥ the target's stored
    generation (otherwise throw, because adopting an older generation would
    let the target's own stale refs alias).
  - index live with the same id: no-op, and values are overwritten as today.
  - index live with a different generation, or retired: throw.
- `toSerialized()` / `static fromSerialized()`:
  `{ free, generations, highWater, retired }`. Liveness is implied: every
  index below `highWater` that isn't free and isn't retired is live. An
  unflushed reservation is written as released, so a reference to it stays
  stale after reload.

`EcsWorld` replaces `nextId` and the `alive` Set with one allocator.
`isAlive` / `entityCount` / `liveEntities` delegate to it. The protected
`_nextId` accessor has no in-repo users and is deleted (pre-1.0, no shim).

### `ColumnStore`: index the sparse set, verify generation

- Page math uses `entityIndex(id)` instead of the raw id.
- `slotFor(id)` returns `ABSENT` unless `slot2id[slot] === id`. That single
  comparison is the generation check. A stale `get` / `has` / `set` /
  `delete` / `markChanged` misses and never touches the new occupant.
- View cache is keyed by index. `viewFor` rebuilds when the cached view's
  `_id !== id` (the slot is cleared on delete already, so this is a guard, not
  a hot path).

`ComponentStore`, `TagStore`, `ArchetypeIndex`, and the spatial structures
are keyed by full id, so a stale id misses naturally. No change is needed
beyond tests.

### `destroyEntity`: signature-driven, stale-safe

- If `allocator.isAlive(id)` is false, return (idempotent, and never touches
  a recycled occupant).
- Walk the entity's archetype signature bits and delete from those stores
  only: O(components held) instead of O(registered stores). This needs a
  `bit → store` array in `ArchetypeIndex` (registration already returns the
  bit).
- Release the id through the allocator last, after the store `delete` events
  have fired with the still-valid id.

### `queueSpawn` / `flushCommands`

`queueSpawn` calls `allocate()` now (the index is reserved and can't be
handed out twice). The `spawn` command calls `activate()` at flush, so
`isAlive` and `EntityCreated` behave as today. Queued `add` / `addTag` /
`remove` already gate on liveness, and they now also reject stale ids.

### Serialization (breaking, no migration)

`toJSON` writes `entities` (the allocator snapshot above) in place of
`nextId`. `loadJSON` restores the allocator and requires `entities`: a
payload with only `nextId` throws a validation error. Every serialized
component and tag id must be a valid packed id **and** live in the restored
allocator (matching generation); otherwise `loadJSON` throws, so a corrupt
or hand-edited save can't plant rows under dead or stale ids. Pre-1.0
saves aren't migrated, and example `localStorage` saves from before the
change are discarded. Two effects:

- Persisted generations of dead indices keep saved stale refs stale after a
  reload.
- The live set comes from the allocator, not from store membership, so a
  **componentless entity now survives save/load**. That resolves the
  limitation noted in
  [entity-liveness.md](entity-liveness.md#serialization).

### `clearAll`

Resets the allocator (generations included). Handles held across a reset
may alias, which is the same contract as today's `nextId = 0`. Document it
in `world.md`.

### Test ergonomics under the brand

About 300 literal-id calls (`store.set(5, …)`) across 8 test files no
longer type-check. `src/test-utils.ts` gains `eid(index, generation = 0)`
(a thin `packEntityId` wrapper, exported only from test-utils), and tests
migrate to it, or to `world.createEntity()` where a world is at hand.

## Tasks

- [x] T1 — `entity-id.ts`: branded type, helpers, constants, with tests
      (pack/unpack round-trip, range guards, generation-0 identity, all ids
      `< 2^30`, `formatEntityId`).
- [x] T2 — `EntityAllocator` + tests: LIFO reuse, generation bump, retire at
      255, budget-exhausted error, stale `release` no-op, reserve vs live,
      `claim` (all cases), serialize round-trip, and churn keeping
      `highWater` bounded to peak-live.
- [x] T3 — `EcsWorld`: allocator replaces `nextId` / `alive`, `_nextId`
      removed; `createEntity`, `queueSpawn`, `flushCommands`, `clearAll`,
      `isAlive`, `entityCount`, `liveEntities` wired.
- [x] T4 — `ArchetypeIndex` `bit → store` lookup; signature-driven,
      stale-safe `destroyEntity`.
- [x] T5 — `ColumnStore` index-based paging + `slot2id` generation check +
      index-keyed view cache; tests for stale get/has/set/delete after
      recycle, including shared (`{ shared: true }`) stores.
- [x] T6 — `transferEntity` via `allocator.claim`; tests for fresh target,
      free index, same-id overwrite, and live/retired conflict throw.
      `scene-transition` tests stay green.
- [x] T7 — Save format: `entities` block in `toJSON` / `loadJSON`; reject
      legacy `nextId`-only payloads; reject loaded ids that are malformed or
      not live in the restored allocator; componentless-entity
      round-trip test; stale ref stays stale after load.
- [x] T8 — ABA regression suite (world-level): destroy → respawn reuses the
      index with a new generation; stale id is not alive; stale
      `destroyEntity` / `queueDestroy` / `queueAdd` / `move` / store access
      leave the new occupant untouched; spatial index (`HashGrid2D`,
      `HashGrid3D` through `enableSpatial`; `ContinuousHashGrid2D` is not a
      `SpatialStructure` and wraps `HashGrid2D`) with a recycled id; queries
      and `added` / `changed` filters see the new entity as added.
- [x] T9 — Brand migration: `eid()` test helper; fix every type error across
      `src/` (modules and tests) and `examples/` so ids come from the world or
      `packEntityId`; `npm run typecheck:examples` green.
- [x] T10 — Sweep modules and examples for numeric assumptions on ids
      (ordering by id, `id + 1`, ids as dense array indices, e.g.
      `examples/solitaire/src/main.ts` `clips[id]`) and fix or confirm each.
- [x] T11 — `examples/stress-storage`: lower the slider maximum to 4M; add a
      churn mode (destroy + respawn N% per tick) and confirm bounded memory
      and no frame-time regression vs `main`. Record the numbers in this
      plan.
- [x] T12 — Docs: `src/world.md` (recycling, generations, id limits,
      stale-handle contract, `clearAll` caveat, save format),
      `src/component-store.md` (column-store generation check), JSDoc on the
      new exports and changed `EcsWorld` members, `docs/agent/README.md`
      invariant (branded ids, `eid()`, no density/order assumptions). The
      repo has no `docs/codebase.md`; core files are not mapped elsewhere.
- [x] T13 — Roadmap bookkeeping: remove 3.2 and its entanglement paragraph
      from [core-engine-roadmap.md](../../roadmap/core-engine-roadmap.md) and
      re-number the suggested order; add D3 (Superseded) and D4 (Declined)
      to [non-goals.md](../../roadmap/non-goals.md).
- [x] T14 — `npm run docs:api` and `npm run docs:usage` regenerated; lint,
      typecheck, `typecheck:examples`, and the full test suite green.
- [x] T15 — Peer review (single pass, small model); fix findings.
- [x] T16 — Sweep this plan for deferred items, confirm each has a durable
      home, and move the plan to `docs/plans/done/` in the final commit.

## Results (T11)

Headless churn benchmark (vitest, Node): 100k entities with two columnar
components, 1% destroyed and respawned per tick for 300 ticks (300k
respawns), plus a column loop per tick; `main` vs this change, three runs each.

| Tree | ms/tick | ArrayBuffer growth |
| --- | --- | --- |
| `main` | 5.26–5.45 | +2.39 MB (new sparse-set pages every 4096 ids) |
| this change | 5.26–5.46 | +0.00 MB (indices recycled) |

Frame time is within run-to-run noise. The first measurement ran 3–5% slower;
the cause was `forEachStoreOf` building a `BigInt` per bit on every destroy.
Caching each store's bit removed it. In the browser, `stress-storage`'s churn
toggle shows the same effect live: "max index" stays below the entity count.

## Out of scope

- **Entity-id remapping on import**: tracked in
  [core roadmap 4.8](../../roadmap/core-engine-roadmap.md#48-entity-id-remapping-on-merge-import). Generations
  don't change that problem. Remapping still rewrites full ids, and the
  allocator's `claim` is the primitive a remap would use.
- **Template `structuredClone` cost on spawn** and **object-store value
  pooling**: a separate GC source, and not the one this entry targets.
  Tracked as core roadmap 3.10.
- **Archetype tables** (3.5): orthogonal. Tables would key rows by index
  exactly as the column store does after this change.

## Downstream breaks (outside this repo, not migrated)

- `EntityId` is branded: code that passes plain numbers as ids stops
  type-checking.
- Anything that persisted a world with `toJSON`: the `nextId`-only format
  no longer loads.
- Subclasses of `EcsWorld` using `_nextId` (`../Roguelike` should be checked
  when it re-pins).
- More than ~4.19M concurrently live entities now throws.
- Code assuming ids are small, dense, or monotonic after entities have been
  destroyed.
