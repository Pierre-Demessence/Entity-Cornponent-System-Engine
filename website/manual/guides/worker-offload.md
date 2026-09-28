# Move heavy work off the main thread

A pathfinding pass, a big procedural generation step, or a physics query over a
large grid will stall the frame no matter how well the systems are ordered. The
work has to leave the main thread. `modules/worker-pool` runs whole jobs on a
pool of Web Workers.

## Put the job in a worker script

The worker's entry point only has to hand its function to `handleJobs`:

```ts
// pathfinding.worker.ts
import { handleJobs } from '@pierre/ecs/modules/worker-pool';

handleJobs((input: { map: number[]; from: number; to: number }) => {
  // ...pure compute, no world access...
  return path;
});
```

The input and the result must be structured-cloneable. That is the boundary the
module cannot cross for you: **a worker gets data, not the world.** Components
and `EntityId`s do not transfer, so a job takes a plain snapshot in and returns a
plain result out.

## Pool them on the main thread

```ts
import { WorkerPool } from '@pierre/ecs/modules/worker-pool';

const pool = new WorkerPool<Job, Path>(() => new Worker(
  new URL('./pathfinding.worker.ts', import.meta.url),
  { type: 'module' },
));

const path = await pool.run(job);
```

`new WorkerPool(spawn, options?)` takes a factory rather than a URL, which is
what makes the pool testable without a browser: `WorkerLike` is the minimal
surface it needs, so a test passes an object with the same shape.

`options.size` sets the number of workers, defaulting to
`navigator.hardwareConcurrency`. `dispose()` shuts them down — do it when the
scene ends rather than leaving workers alive behind a world that no longer
exists.

## The shape this fits

Because a job is a snapshot in and a result out, the pattern that works is:

1. A system gathers the plain data for the job.
2. The pool runs it and returns a result.
3. A later tick applies the result to the world.

Step 3 is a tick-boundary problem like any other deferred change — apply results
where the world is not mid-iteration, not from inside the promise callback.

## Measure it, do not assume it

Offloading is not free: the clone in and out costs real time, and a job smaller
than that cost is slower on a worker than on the main thread. `examples/worker-offload`
is the worked example — it runs the same job both ways, stalls the main thread
with one, and shows the other keeping the frame smooth.

## See also

- [`modules/worker-pool`](../../modules/worker-pool/) — the module.
- [`examples/worker-offload`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/worker-offload)
  — the worked example, main-thread stall against offloaded.
- [Watch frame time](../debug-overlay/) — confirming the stall is gone.
