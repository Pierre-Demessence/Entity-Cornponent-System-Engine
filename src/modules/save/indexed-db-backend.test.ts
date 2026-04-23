import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IndexedDBBackend } from './indexed-db-backend';
import { createEnvelope } from './save-storage';

import 'fake-indexeddb/auto';

const TEST_DB_NAME = 'ecs-save-tests';

let backend: IndexedDBBackend;

beforeEach(async () => {
  backend = new IndexedDBBackend({ dbName: TEST_DB_NAME, dbVersion: 1, storeName: 'saves' });
  await backend.open();
});

afterEach(() => {
  backend.close();
  indexedDB.deleteDatabase(TEST_DB_NAME);
});

describe('indexedDBBackend', () => {
  describe('save + load round-trip', () => {
    it('saves and loads data with integrity', async () => {
      await backend.save('key', '{"gold":42}');
      const loaded = await backend.load('key');
      expect(loaded).toBe('{"gold":42}');
    });
  });

  describe('backup rotation', () => {
    it('rotates current save to _prev on update', async () => {
      await backend.save('key', 'first');
      await backend.save('key', 'second');

      const loaded = await backend.load('key');
      expect(loaded).toBe('second');
    });

    it('falls back to _prev when primary is corrupt', async () => {
      await backend.save('key', 'good-data');
      await backend.save('key', 'newer-data');

      // Corrupt the primary by writing garbage directly.
      await corruptKey(backend, 'key');

      const loaded = await backend.load('key');
      expect(loaded).toBe('good-data');
    });

    it('returns null when both primary and backup are corrupt', async () => {
      await backend.save('key', 'data');
      await corruptKey(backend, 'key');
      await corruptKey(backend, 'key_prev');

      const loaded = await backend.load('key');
      expect(loaded).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes primary, _prev, and _tmp keys', async () => {
      await backend.save('key', 'data');
      await backend.save('key', 'data2');

      await backend.delete('key');

      expect(await backend.load('key')).toBeNull();
    });
  });

  describe('orphan recovery', () => {
    const pattern = /^test_save_\d+_tmp$/;

    it('promotes orphaned tmp key when real key is missing', async () => {
      const envelope = await createEnvelope('orphan-data');
      await writeRaw(backend, 'test_save_0_tmp', JSON.stringify(envelope));

      await backend.recoverOrphans(pattern);

      const loaded = await backend.load('test_save_0');
      expect(loaded).toBe('orphan-data');
    });

    it('removes orphaned tmp key when real key is valid', async () => {
      await backend.save('test_save_0', 'real-data');
      const orphanEnvelope = await createEnvelope('stale-orphan');
      await writeRaw(backend, 'test_save_0_tmp', JSON.stringify(orphanEnvelope));

      await backend.recoverOrphans(pattern);

      const loaded = await backend.load('test_save_0');
      expect(loaded).toBe('real-data');
    });

    it('removes invalid orphaned tmp keys', async () => {
      await writeRaw(backend, 'test_save_0_tmp', 'not-an-envelope');

      await backend.recoverOrphans(pattern);

      expect(await backend.load('test_save_0')).toBeNull();
    });

    it('promotes tmp when real key is corrupt', async () => {
      await corruptKey(backend, 'test_save_0');
      const envelope = await createEnvelope('rescue-data');
      await writeRaw(backend, 'test_save_0_tmp', JSON.stringify(envelope));

      await backend.recoverOrphans(pattern);

      const loaded = await backend.load('test_save_0');
      expect(loaded).toBe('rescue-data');
    });
  });

  describe('load edge cases', () => {
    it('returns null for nonexistent key', async () => {
      expect(await backend.load('missing')).toBeNull();
    });

    it('returns null when primary is corrupt and backup is missing', async () => {
      await corruptKey(backend, 'key');
      expect(await backend.load('key')).toBeNull();
    });
  });

  describe('open idempotency', () => {
    it('calling open() twice does not throw', async () => {
      await backend.open();
      await backend.save('key', 'data');
      expect(await backend.load('key')).toBe('data');
    });
  });

  describe('lifecycle', () => {
    it('throws when used before open()', async () => {
      const fresh = new IndexedDBBackend({ dbName: TEST_DB_NAME, dbVersion: 1, storeName: 'saves' });
      await expect(fresh.save('key', 'data')).rejects.toThrow(/not opened/i);
    });

    it('works after close + reopen', async () => {
      await backend.save('key', 'data');
      backend.close();

      await backend.open();
      expect(await backend.load('key')).toBe('data');
    });
  });
});

// Helpers - write raw data bypassing the envelope layer to simulate corruption.
async function writeRaw(b: IndexedDBBackend, key: string, data: string): Promise<void> {
  await (b as any).rawWrite(key, data);
}

async function corruptKey(b: IndexedDBBackend, key: string): Promise<void> {
  await writeRaw(b, key, 'garbage');
}
