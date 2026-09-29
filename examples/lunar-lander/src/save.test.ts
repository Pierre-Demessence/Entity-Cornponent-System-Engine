import { LocalStorageBackend } from '@pierre/ecs/modules/save';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadRuns, recordRun } from './save';

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

const run = (score: number): { at: number; landings: number; score: number } => ({ at: 1, landings: 1, score });

describe('leaderboard', () => {
  it('starts empty', async () => {
    expect(await loadRuns(new LocalStorageBackend())).toEqual([]);
  });

  it('keeps the top five, best first, across reloads', async () => {
    const storage = new LocalStorageBackend();
    for (const s of [10, 90, 30, 70, 50, 20, 80])
      await recordRun(storage, run(s));
    const runs = await loadRuns(new LocalStorageBackend());
    expect(runs.map(r => r.score)).toEqual([90, 80, 70, 50, 30]);
  });

  it('drops an entry whose payload was edited after saving', async () => {
    const storage = new LocalStorageBackend();
    await recordRun(storage, run(40));
    await recordRun(storage, run(60));

    const key = [...store.keys()].find(k => k === 'pierre-ecs-lunar-lander')!;
    // The store holds the SaveStorage envelope; the board sits inside its payload.
    const outer = JSON.parse(store.get(key)!) as { payload: string };
    const board = JSON.parse(outer.payload) as { runs: Array<{ payload: string }> };
    board.runs[0]!.payload = JSON.stringify(run(999999));
    const forged = JSON.stringify(board);
    // Re-save the forged board through the outer layer so only the inner checksum can catch it.
    await storage.save('pierre-ecs-lunar-lander', forged);

    expect((await loadRuns(storage)).map(r => r.score)).toEqual([40]);
  });
});
