# `@pierre/ecs/modules/worker-pool`

Task-parallelism helper: run whole jobs on a pool of Web Workers, off the main
thread, and get a `Promise` back. This is *task* parallelism (offload a
self-contained job) — distinct from *data* parallelism over shared memory. See
[`docs/plans/ecs-parallelism-and-soa-storage.md`](../../../docs/plans/ecs-parallelism-and-soa-storage.md)
(step A).

Use it for coarse-grained, self-contained work whose input/output is small
relative to the compute — pathfinding a whole flow-field, procedural
generation, image/asset decoding, audio DSP. Not for per-tick ECS systems: the
`postMessage` copy would cost more than the work.

## API

- `WorkerPool<TIn, TOut>` — main-thread pool.
  - `new WorkerPool(spawn, { size? })` — `spawn` returns a `Worker` (typically
    `() => new Worker(new URL('./job.worker.ts', import.meta.url), { type: 'module' })`).
    `size` defaults to `navigator.hardwareConcurrency` (or 4).
  - `run(input): Promise<TOut>` — dispatches to an idle worker, or queues if all
    are busy; resolves with the worker's result, rejects if the job threw.
  - `dispose()` — terminate every worker.
- `handleJobs<TIn, TOut>(fn)` — worker-side. Wires the message protocol so the
  worker script only supplies the job function (sync or async).

## Example

```ts
// job.worker.ts
import { handleJobs } from '@pierre/ecs/modules/worker-pool';
handleJobs((input: Grid) => solveFlowField(input));
```

```ts
// main.ts
import { WorkerPool } from '@pierre/ecs/modules/worker-pool';

const pool = new WorkerPool<Grid, FlowField>(
  () => new Worker(new URL('./job.worker.ts', import.meta.url), { type: 'module' }),
);
const field = await pool.run(grid); // main thread never stalls
```

See [`examples/worker-offload`](../../../examples/worker-offload/) for a live
main-thread-stall demo (job on the main thread freezes the page; in the worker
the animation stays smooth).

## Not included

- **Transferables** (zero-copy `ArrayBuffer` hand-off) — the input is
  structured-cloned. A `transfer` option can be added when a consumer needs it.
