# Entity Liveness / Existence API (core-engine roadmap 1.5)

Record which entity ids are alive so a caller holding an id can ask whether it
still refers to anything, instead of probing an unrelated component store as a
proxy. Canon: Bevy `Entities` / `world.iter_entities`, Unity
`EntityManager.Exists`, Flecs `ecs_is_alive`, EnTT `valid()` / `alive()`.

Ids are **not recycled** today (`createEntity` = `nextId++`), so liveness is
simply "created and not yet destroyed" — no generation counter (that is 3.2's
ABA problem, logged separately). This entry settles the liveness surface the
recycling work will later build on.

## Design

- `EcsWorld` keeps a `private alive = new Set<EntityId>()`, maintained at every
  lifecycle edge:
  - `createEntity` (and therefore `spawn` / `spawnBatch`, which call it) — add.
  - `destroyEntity` (and therefore `queueDestroy` → `flushDestroys`) — delete.
  - `transferEntity` — add on the destination world.
  - `clearAll` — clear.
  - `loadJSON` — rebuilt from the persisted component/tag membership.
- Public surface (canon-complete trio, all small):
  - `isAlive(id): boolean`
  - `entityCount(): number`
  - `liveEntities(): IterableIterator<EntityId>`

## Serialization

`toJSON` / `loadJSON` are unchanged in format. On load, `alive` is rebuilt as
the union of every loaded component and tag store's ids. A component-less
entity has no persisted representation (already true — the save format only
carries component and tag data), so it does not survive save/load; this is
consistent with the existing serialization contract, not a new limitation.

## Checklist

- [x] `alive` set + `isAlive` / `entityCount` / `liveEntities` on `EcsWorld`
- [x] Wire create / destroy / queueDestroy+flush / spawn / transferEntity / clearAll
- [x] `loadJSON` rebuilds liveness from persisted membership
- [x] Tests: create/destroy, count, queueDestroy flush, clearAll, spawn, transfer, load round-trip, never-created id, iteration
- [x] `world.md` documents the liveness surface
- [x] `npm run docs:api` regenerated; drift tests green
- [x] tsc + lint + full test suite green
- [x] peer review clean
