import type { WorkerLike } from './worker-pool';

import { describe, expect, it } from 'vitest';

import { WorkerPool } from './worker-pool';

/** A fake worker that replies asynchronously by applying `handler` to the input. */
function makeMockWorker(handler: (input: unknown) => unknown): WorkerLike & { calls: number } {
  let listener: ((e: MessageEvent) => void) | null = null;
  const w = {
    calls: 0,
    addEventListener: (_type: 'message', l: (e: MessageEvent) => void): void => { listener = l; },
    terminate: (): void => {},
    postMessage: (message: unknown): void => {
      w.calls++;
      const { id, input } = message as { id: number; input: unknown };
      queueMicrotask(() => {
        let env: { error?: unknown; id: number; result?: unknown };
        try {
          env = { id, result: handler(input) };
        }
        catch (e) {
          env = { id, error: String(e) };
        }
        listener?.({ data: env } as MessageEvent);
      });
    },
  };
  return w;
}

describe('workerPool', () => {
  it('runs a job and resolves with the result', async () => {
    const pool = new WorkerPool<number, number>(() => makeMockWorker(n => (n as number) * 2), { size: 1 });
    expect(await pool.run(21)).toBe(42);
  });

  it('distributes jobs across all workers', async () => {
    const workers: Array<WorkerLike & { calls: number }> = [];
    const pool = new WorkerPool<number, number>(() => {
      const w = makeMockWorker(n => n as number);
      workers.push(w);
      return w;
    }, { size: 3 });
    await Promise.all([pool.run(1), pool.run(2), pool.run(3)]);
    expect(workers.filter(w => w.calls === 1).length).toBe(3);
  });

  it('queues jobs when every worker is busy (size 1)', async () => {
    const pool = new WorkerPool<number, number>(() => makeMockWorker(n => (n as number) + 100), { size: 1 });
    const results = await Promise.all([pool.run(1), pool.run(2), pool.run(3)]);
    expect(results).toEqual([101, 102, 103]);
  });

  it('rejects when the job throws', async () => {
    const boom = (): never => {
      throw new Error('boom');
    };
    const pool = new WorkerPool<number, number>(() => makeMockWorker(boom), { size: 1 });
    await expect(pool.run(1)).rejects.toBe('Error: boom');
  });

  it('dispose terminates every worker', () => {
    const terminated: number[] = [];
    let i = 0;
    const pool = new WorkerPool<number, number>(() => {
      const id = i++;
      const w = makeMockWorker(n => n as number);
      w.terminate = (): void => {
        terminated.push(id);
      };
      return w;
    }, { size: 2 });
    pool.dispose();
    expect(terminated.sort()).toEqual([0, 1]);
  });
});
