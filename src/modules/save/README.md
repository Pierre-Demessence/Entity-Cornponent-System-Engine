# @pierre/ecs/modules/save

Versioned-save primitives for browser games: migration chains, integrity
envelopes, backup rotation, orphan recovery, and IndexedDB/localStorage
backends.

Canon: engine save systems that treat persistence as a first-class runtime
primitive with explicit upgrade paths and corruption handling.

## API

```ts
type MigrateFn = (blob: Record<string, unknown>) => Record<string, unknown>;

class MigrationRegistry {
  register(from: number, to: number, migrate: MigrateFn): this;
  run(blob: Record<string, unknown>, savedVersion: number, targetVersion: number): Record<string, unknown>;
}

interface SaveEnvelope {
  checksum: string;
  payload: string;
  header?: unknown;
}

abstract class SaveStorage {
  save(key: string, data: string, header?: unknown): Promise<void>;
  load(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  listSaves(keyPattern: RegExp): Promise<Array<{ key: string; header: unknown }>>;
  recoverOrphans(keyPattern: RegExp): Promise<void>;
}

class IndexedDBBackend extends SaveStorage {
  constructor(options?: { dbName?: string; dbVersion?: number; storeName?: string });
  open(): Promise<void>;
  close(): void;
}

class LocalStorageBackend extends SaveStorage {}

function computeChecksum(data: string): Promise<string>;
function createEnvelope(data: string, header?: unknown): Promise<SaveEnvelope>;
function verifyEnvelope(envelope: SaveEnvelope): Promise<boolean>;
```

## Behavior

- `MigrationRegistry` allows only one outgoing migration per version to keep
  upgrade paths deterministic.
- `SaveStorage.load` validates checksums and falls back to `_prev` backup when
  primary data is corrupt.
- `SaveStorage.save` rotates current payload to `_prev` before promoting the
  new payload.
- `recoverOrphans` scans `_tmp` keys and promotes valid orphan writes when
  primary keys are missing or invalid.

## Notes

- This module is format-agnostic. Consumers own domain payload shape,
  key naming, and storage key patterns.
- Downgrade migrations are intentionally unsupported.
