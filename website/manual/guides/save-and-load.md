# Save and load

Two separate problems get called "saving": turning a world into bytes, and
getting those bytes somewhere durable without corruption. The engine splits them.
Core owns serialization; `modules/save` owns storage.

## Serialize the world

`EcsWorld` serializes itself, keyed by component and tag name. Loading restores
into the stores already registered on the world, so register the same schemas —
in any order — before loading. A saved component with no registered store is
skipped without an error.

```ts
const blob = JSON.stringify(world.toJSON());

// later, on a world with the same components registered:
world.loadJSON(JSON.parse(blob));
```

What each component contributes is up to its `ComponentDef`: `serialize` and
`deserialize` are part of the definition, so a component decides its own wire
shape. That is where to put the logic for anything that cannot be a plain object
— see [`component-store`](../../core/component-store/).

## Store it durably

`SaveStorage` is the base class of the two storage backends, and it holds
everything a save slot needs: integrity checks, backup rotation, and orphan
recovery after an interrupted write. A backend only supplies raw key-value
access, so you construct the backend and use it as the `SaveStorage`:

```ts
import { IndexedDBBackend } from '@pierre/ecs/modules/save';

const storage = new IndexedDBBackend({ dbName: 'my-game' });
await storage.open();
await storage.save('slot-1', JSON.stringify(world.toJSON()), { savedAt: Date.now() });

const raw = await storage.load('slot-1');       // string | null
await storage.delete('slot-1');
const slots = await storage.listSaves(/^slot-/); // [{ key, header }]
```

`IndexedDBBackend` must be `open()`ed before its first read or write.
`LocalStorageBackend` is the drop-in alternative when IndexedDB is overkill:
it needs no opening, and since `localStorage` has no transactions, it writes
through a temp key and reads it back, so a torn write cannot leave a half-saved
slot behind. With either backend, `save` keeps the previous save as a backup and
`load` falls back to it when the primary fails its checksum.

## Version the payload

A save written by yesterday's build is data from an older schema, and prod saves
outlive the code that wrote them. `MigrationRegistry` chains one version to the
next so a load can walk forward:

```ts
import { MigrationRegistry } from '@pierre/ecs/modules/save';

const migrations = new MigrationRegistry().register(1, 2, (blob) => ({
  ...blob,
  // ... reshape v1 into v2
}));

const upgraded = migrations.run(JSON.parse(raw), savedVersion, TARGET_VERSION);
```

One outgoing migration per version, and the chain is validated — a gap is an
error rather than a silent half-upgrade.

## Envelopes

When the payload must survive a medium that can corrupt it, `createEnvelope` /
`verifyEnvelope` add a SHA-256 checksum via the Web Crypto API:

```ts
import { createEnvelope, verifyEnvelope } from '@pierre/ecs/modules/save';

const envelope = await createEnvelope(payload, { savedAt: Date.now() });
if (await verifyEnvelope(envelope))
  world.loadJSON(JSON.parse(envelope.payload));
```

`SaveStorage` does this for you; the functions are exported for cases where you
store the envelope yourself.

## See also

- [`modules/save`](../../modules/save/) — the module.
- [`component-store`](../../core/component-store/) — `serialize` / `deserialize`
  on each component, and schema evolution.
- [`world`](../../core/world/) — `toJSON` / `loadJSON` and the registration-order
  invariant.
