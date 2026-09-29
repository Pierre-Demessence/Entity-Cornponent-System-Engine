import type { SaveEnvelope, SaveStorage } from '@pierre/ecs/modules/save';

import { createEnvelope, IndexedDBBackend, LocalStorageBackend, verifyEnvelope } from '@pierre/ecs/modules/save';

const SAVE_KEY = 'pierre-ecs-lunar-lander';
const SAVE_PATTERN = /^pierre-ecs-lunar-lander$/;
const BOARD_SIZE = 5;

/** One finished run on the leaderboard. */
export interface Run {
  at: number;
  landings: number;
  score: number;
}

interface Board { runs: SaveEnvelope[]; version: 1 }

/** IndexedDB when the browser allows it, localStorage otherwise. */
export async function openStorage(): Promise<SaveStorage> {
  let storage: SaveStorage;
  try {
    const idb = new IndexedDBBackend({ dbName: 'pierre-ecs-lunar-lander' });
    await idb.open();
    storage = idb;
  }
  catch {
    storage = new LocalStorageBackend();
  }
  await storage.recoverOrphans(SAVE_PATTERN);
  return storage;
}

async function readEnvelopes(storage: SaveStorage): Promise<SaveEnvelope[]> {
  const raw = await storage.load(SAVE_KEY);
  if (raw === null)
    return [];
  const board = JSON.parse(raw) as Partial<Board>;
  return Array.isArray(board.runs) ? board.runs : [];
}

function isRun(value: unknown): value is Run {
  const v = value as Partial<Run> | null;
  return typeof v?.score === 'number' && typeof v.landings === 'number' && typeof v.at === 'number';
}

/** Verified runs, best first. An envelope whose checksum no longer matches its payload is dropped. */
export async function loadRuns(storage: SaveStorage): Promise<Run[]> {
  const runs: Run[] = [];
  for (const envelope of await readEnvelopes(storage)) {
    if (!(await verifyEnvelope(envelope)))
      continue;
    const run: unknown = JSON.parse(envelope.payload);
    if (isRun(run))
      runs.push(run);
  }
  return runs.sort((a, b) => b.score - a.score).slice(0, BOARD_SIZE);
}

/** Add `run` to the board (top {@link BOARD_SIZE} kept) and return the new verified list. */
export async function recordRun(storage: SaveStorage, run: Run): Promise<Run[]> {
  const kept = await loadRuns(storage);
  const runs = [...kept, run].sort((a, b) => b.score - a.score).slice(0, BOARD_SIZE);
  const envelopes = await Promise.all(runs.map(r => createEnvelope(JSON.stringify(r), { score: r.score })));
  const board: Board = { runs: envelopes, version: 1 };
  await storage.save(SAVE_KEY, JSON.stringify(board));
  return runs;
}
