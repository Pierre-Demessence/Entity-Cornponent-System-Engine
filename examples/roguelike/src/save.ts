import type { SaveStorage } from '@pierre/ecs/modules/save';

import { IndexedDBBackend, LocalStorageBackend, MigrationRegistry } from '@pierre/ecs/modules/save';

const SAVE_KEY = 'pierre-ecs-roguelike';
const SAVE_PATTERN = /^pierre-ecs-roguelike$/;

export const SAVE_VERSION = 2;

/**
 * The saved blob. The map itself is not stored: `(seed, depth)` regenerates it,
 * so only what the player changed — the world's entities and the explored
 * mask — goes to disk.
 */
export interface SaveData {
  depth: number;
  /** Explored mask as a string of `0` / `1`, one char per cell. */
  explored: string;
  seed: number;
  turn: number;
  version: number;
  world: Record<string, unknown>;
}

export interface SaveHeader { depth: number; savedAt: number }

// Version 1 called the depth `floor`. The registry upgrades old blobs on load,
// one step per version, so each step only knows about its neighbour.
const migrations = new MigrationRegistry().register(1, 2, (blob) => {
  const { floor, ...rest } = blob;
  return { ...rest, depth: floor };
});

/** IndexedDB when the browser allows it, localStorage otherwise. */
export async function openSaveStorage(): Promise<SaveStorage> {
  let storage: SaveStorage;
  try {
    const idb = new IndexedDBBackend({ dbName: 'pierre-ecs-roguelike' });
    await idb.open();
    storage = idb;
  }
  catch {
    storage = new LocalStorageBackend();
  }
  // A crash mid-write leaves a `_tmp` key behind; promote it if it's the only valid copy.
  await storage.recoverOrphans(SAVE_PATTERN);
  return storage;
}

export async function writeSave(storage: SaveStorage, data: SaveData): Promise<void> {
  const header: SaveHeader = { depth: data.depth, savedAt: Date.now() };
  await storage.save(SAVE_KEY, JSON.stringify(data), header);
}

/** Null when there is no save, or when both the save and its backup fail their checksum. */
export async function readSave(storage: SaveStorage): Promise<SaveData | null> {
  const raw = await storage.load(SAVE_KEY);
  if (raw === null)
    return null;
  const blob = JSON.parse(raw) as Record<string, unknown>;
  const version = typeof blob.version === 'number' ? blob.version : 1;
  const upgraded = migrations.run(blob, version, SAVE_VERSION);
  return { ...upgraded, version: SAVE_VERSION } as unknown as SaveData;
}

/** The header of the current save, read without parsing the payload. */
export async function describeSave(storage: SaveStorage): Promise<SaveHeader | null> {
  const [entry] = await storage.listSaves(SAVE_PATTERN);
  return (entry?.header as SaveHeader | undefined) ?? null;
}

export function encodeMask(mask: Uint8Array): string {
  return Array.from(mask, v => (v ? '1' : '0')).join('');
}

export function decodeMask(text: string, into: Uint8Array): void {
  for (let i = 0; i < into.length; i++)
    into[i] = text.charCodeAt(i) === 49 ? 1 : 0;
}
