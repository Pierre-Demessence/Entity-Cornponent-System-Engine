import type { SaveEnvelope } from './save-storage';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalStorageBackend } from './local-storage-backend';
import { computeChecksum, createEnvelope, verifyEnvelope } from './save-storage';

const store = new Map<string, string>();
const mockLocalStorage = {
  clear: () => { store.clear(); },
  getItem: (key: string) => store.get(key) ?? null,
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
  removeItem: (key: string) => { store.delete(key); },
  setItem: (key: string, value: string) => { store.set(key, value); },
};

beforeEach(() => {
  vi.stubGlobal('localStorage', mockLocalStorage);
});

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe('computeChecksum', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await computeChecksum('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await computeChecksum('alpha');
    const b = await computeChecksum('beta');
    expect(a).not.toBe(b);
  });

  it('is deterministic', async () => {
    const a = await computeChecksum('same');
    const b = await computeChecksum('same');
    expect(a).toBe(b);
  });
});

describe('createEnvelope / verifyEnvelope', () => {
  it('creates a valid envelope', async () => {
    const envelope = await createEnvelope('test-data');
    expect(envelope.payload).toBe('test-data');
    expect(envelope.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies a valid envelope', async () => {
    const envelope = await createEnvelope('payload');
    expect(await verifyEnvelope(envelope)).toBe(true);
  });

  it('rejects a tampered envelope', async () => {
    const envelope = await createEnvelope('original');
    envelope.payload = 'tampered';
    expect(await verifyEnvelope(envelope)).toBe(false);
  });
});

describe('localStorageBackend', () => {
  let backend: LocalStorageBackend;

  beforeEach(() => {
    backend = new LocalStorageBackend();
  });

  describe('save + load round-trip', () => {
    it('saves and loads data with integrity', async () => {
      await backend.save('test_key', '{"gold":42}');
      const loaded = await backend.load('test_key');
      expect(loaded).toBe('{"gold":42}');
    });

    it('stores data as a checksum envelope', async () => {
      await backend.save('test_key', 'my-data');
      const raw = store.get('test_key')!;
      const parsed = JSON.parse(raw) as SaveEnvelope;
      expect(parsed.checksum).toMatch(/^[0-9a-f]{64}$/);
      expect(parsed.payload).toBe('my-data');
    });
  });

  describe('backup rotation', () => {
    it('rotates current save to _prev on update', async () => {
      await backend.save('key', 'first');
      await backend.save('key', 'second');

      const loaded = await backend.load('key');
      expect(loaded).toBe('second');

      const prevRaw = store.get('key_prev');
      expect(prevRaw).toBeDefined();
      const prevEnvelope = JSON.parse(prevRaw!) as SaveEnvelope;
      expect(prevEnvelope.payload).toBe('first');
    });

    it('falls back to _prev when primary is corrupt', async () => {
      await backend.save('key', 'good-data');
      await backend.save('key', 'newer-data');

      // Corrupt the primary.
      store.set('key', 'garbage');

      const loaded = await backend.load('key');
      expect(loaded).toBe('good-data');
    });

    it('returns null when both primary and backup are corrupt', async () => {
      await backend.save('key', 'data');
      store.set('key', 'corrupt');
      store.set('key_prev', 'also-corrupt');

      const loaded = await backend.load('key');
      expect(loaded).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes primary, _prev, and _tmp keys', async () => {
      await backend.save('key', 'data');
      await backend.save('key', 'data2');
      store.set('key_tmp', 'orphan');

      await backend.delete('key');

      expect(store.has('key')).toBe(false);
      expect(store.has('key_prev')).toBe(false);
      expect(store.has('key_tmp')).toBe(false);
    });
  });

  describe('atomic write integrity', () => {
    it('preserves old save when quota is exceeded during write', async () => {
      await backend.save('key', 'original');

      const originalSetItem = mockLocalStorage.setItem;
      let callCount = 0;
      mockLocalStorage.setItem = (k: string, v: string) => {
        callCount++;
        if (callCount >= 2 && k.endsWith('_tmp')) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        originalSetItem(k, v);
      };

      await expect(backend.save('key', 'new-data')).rejects.toThrow();

      mockLocalStorage.setItem = originalSetItem;

      const loaded = await backend.load('key');
      expect(loaded).toBe('original');
    });
  });

  describe('orphan recovery', () => {
    const pattern = /^test_save_\d+_tmp$/;

    it('promotes orphaned tmp key when real key is missing', async () => {
      const envelope = await createEnvelope('orphan-data');
      store.set('test_save_0_tmp', JSON.stringify(envelope));

      await backend.recoverOrphans(pattern);

      expect(store.has('test_save_0_tmp')).toBe(false);
      const loaded = await backend.load('test_save_0');
      expect(loaded).toBe('orphan-data');
    });

    it('removes orphaned tmp key when real key is valid', async () => {
      await backend.save('test_save_0', 'real-data');
      const orphanEnvelope = await createEnvelope('stale-orphan');
      store.set('test_save_0_tmp', JSON.stringify(orphanEnvelope));

      await backend.recoverOrphans(pattern);

      expect(store.has('test_save_0_tmp')).toBe(false);
      const loaded = await backend.load('test_save_0');
      expect(loaded).toBe('real-data');
    });

    it('removes invalid orphaned tmp keys', async () => {
      store.set('test_save_0_tmp', 'not-an-envelope');

      await backend.recoverOrphans(pattern);

      expect(store.has('test_save_0_tmp')).toBe(false);
      expect(store.has('test_save_0')).toBe(false);
    });

    it('promotes tmp when real key is corrupt', async () => {
      store.set('test_save_0', 'corrupt-primary');
      const envelope = await createEnvelope('rescue-data');
      store.set('test_save_0_tmp', JSON.stringify(envelope));

      await backend.recoverOrphans(pattern);

      expect(store.has('test_save_0_tmp')).toBe(false);
      const loaded = await backend.load('test_save_0');
      expect(loaded).toBe('rescue-data');
    });

    it('cleans up nested _prev_tmp orphans', async () => {
      const prevPattern = /^test_save_\d+(_prev)?_tmp$/;
      const envelope = await createEnvelope('backup-data');
      store.set('test_save_0_prev_tmp', JSON.stringify(envelope));

      await backend.recoverOrphans(prevPattern);

      expect(store.has('test_save_0_prev_tmp')).toBe(false);
    });
  });

  describe('load edge cases', () => {
    it('returns null for nonexistent key', async () => {
      expect(await backend.load('missing')).toBeNull();
    });

    it('returns null for non-envelope data', async () => {
      store.set('key', '{"not":"an-envelope"}');
      expect(await backend.load('key')).toBeNull();
    });

    it('returns null when primary is corrupt and backup is missing', async () => {
      store.set('key', 'corrupt');
      expect(await backend.load('key')).toBeNull();
    });

    it('returns null when primary is corrupt and backup is also corrupt', async () => {
      store.set('key', 'corrupt-primary');
      store.set('key_prev', 'corrupt-backup');
      expect(await backend.load('key')).toBeNull();
    });
  });

  describe('quota during backup rotation', () => {
    it('preserves primary when backup write fails', async () => {
      await backend.save('key', 'original');

      const originalSetItem = mockLocalStorage.setItem;
      mockLocalStorage.setItem = (k: string, v: string) => {
        // Fail on _prev_tmp (backup rotation's atomic write).
        if (k.includes('_prev_tmp')) {
          throw new DOMException('Quota exceeded', 'QuotaExceededError');
        }
        originalSetItem(k, v);
      };

      await expect(backend.save('key', 'updated')).rejects.toThrow();

      mockLocalStorage.setItem = originalSetItem;

      const loaded = await backend.load('key');
      expect(loaded).toBe('original');
    });
  });
});
