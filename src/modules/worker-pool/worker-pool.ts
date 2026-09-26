/**
 * Minimal Worker surface the pool needs — satisfied by a real DOM `Worker`,
 * and easy to fake in tests.
 */
export interface WorkerLike {
  addEventListener: (type: 'message', listener: (e: MessageEvent) => void) => void;
  postMessage: (message: unknown) => void;
  terminate: () => void;
}

/** Options for a `WorkerPool`: the number of workers (`size`, default `navigator.hardwareConcurrency`). */
export interface WorkerPoolOptions {
  /** Number of workers. Defaults to `navigator.hardwareConcurrency` (or 4). */
  size?: number;
}

interface PoolJob {
  input: unknown;
  reject: (error: unknown) => void;
  resolve: (result: unknown) => void;
}

interface Envelope {
  id: number;
  error?: unknown;
  input?: unknown;
  result?: unknown;
}

function defaultSize(): number {
  const n = (globalThis.navigator as Navigator | undefined)?.hardwareConcurrency;
  return typeof n === 'number' && n > 0 ? n : 4;
}

/**
 * A fixed pool of Web Workers that runs jobs off the main thread. Pass a spawn
 * function (typically `() => new Worker(new URL('./job.worker.ts',
 * import.meta.url), { type: 'module' })`); each {@link run} returns a Promise
 * that resolves with the worker's result. Jobs queue when every worker is busy
 * and dispatch as workers free up. The worker script wires the message protocol
 * via {@link handleJobs}.
 *
 * This is task parallelism (offload a whole job), distinct from data
 * parallelism over shared memory — see
 * docs/plans/ecs-parallelism-and-soa-storage.md (step A).
 */
export class WorkerPool<TIn, TOut> {
  private readonly busy = new Map<WorkerLike, { id: number; job: PoolJob }>();
  private readonly idle: WorkerLike[] = [];
  private nextId = 1;
  private readonly queue: PoolJob[] = [];
  private readonly workers: WorkerLike[] = [];

  constructor(spawn: () => WorkerLike, options: WorkerPoolOptions = {}) {
    const size = options.size ?? defaultSize();
    for (let i = 0; i < size; i++) {
      const w = spawn();
      w.addEventListener('message', (e: MessageEvent) => this.onMessage(w, e.data as Envelope));
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  private dispatch(w: WorkerLike, job: PoolJob): void {
    const id = this.nextId++;
    this.busy.set(w, { id, job });
    const env: Envelope = { id, input: job.input };
    w.postMessage(env);
  }

  /** Terminate every worker and drop any queued jobs. */
  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
    this.idle.length = 0;
    this.busy.clear();
    this.queue.length = 0;
  }

  private onMessage(w: WorkerLike, env: Envelope): void {
    const entry = this.busy.get(w);
    if (!entry || entry.id !== env.id)
      return;
    this.busy.delete(w);
    if (env.error !== undefined)
      entry.job.reject(env.error);
    else
      entry.job.resolve(env.result);

    const next = this.queue.shift();
    if (next)
      this.dispatch(w, next);
    else
      this.idle.push(w);
  }

  /** Run one job. Resolves with the worker's result, or rejects if it threw. */
  run(input: TIn): Promise<TOut> {
    return new Promise<TOut>((resolve, reject) => {
      const job: PoolJob = { input, reject, resolve: resolve as (r: unknown) => void };
      const w = this.idle.pop();
      if (w)
        this.dispatch(w, job);
      else
        this.queue.push(job);
    });
  }
}

/**
 * Worker-side counterpart to {@link WorkerPool}: wires the message protocol so
 * the worker script only supplies the job function. Handles both sync and async
 * jobs and reports thrown errors back to the pool (rejecting the Promise).
 *
 * @example
 * // job.worker.ts
 * handleJobs((input: MyInput) => heavyCompute(input));
 */
export function handleJobs<TIn, TOut>(fn: (input: TIn) => Promise<TOut> | TOut): void {
  const ctx = globalThis as unknown as {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage: (message: unknown) => void;
  };
  ctx.onmessage = (e): void => {
    const { id, input } = e.data as { id: number; input: unknown };
    void (async () => {
      try {
        const result = await fn(input as TIn);
        ctx.postMessage({ id, result });
      }
      catch (err) {
        ctx.postMessage({ id, error: String(err) });
      }
    })();
  };
}
