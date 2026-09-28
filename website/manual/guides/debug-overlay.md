# Watch frame time

Frame-time problems do not announce themselves. A system that got slower, a
worker that is not actually offloaded, a fixed-timestep source catching up every
frame — all of them look like "it feels bad". `modules/stats` is the smallest
thing that turns that into a number.

## Collect, then draw

The collector is headless. It takes measured durations and keeps
current/min/max/average; the overlay is a separate call you can leave out.

```ts
import { drawStatsOverlay, FrameStats } from '@pierre/ecs/modules/stats';

const stats = new FrameStats();

function frame(now: number): void {
  stats.sample(now - last);
  last = now;

  renderer.render({ ctx2d, world });
  drawStatsOverlay(ctx2d, stats);

  requestAnimationFrame(frame);
}
```

`drawStatsOverlay` draws a stats.js-style readout plus a frame-time graph.
`StatsOverlayOptions` configures it; with no options it draws a compact default.

## Measure the tick, not just the frame

A frame time is rendering plus simulation. To attribute the cost, wrap the tick
source so each tick's wall-clock duration is recorded:

```ts
import { FrameStats, TimedTickSource } from '@pierre/ecs/modules/stats';

const stats = new FrameStats();
const source = new TimedTickSource(realSource, stats);
```

Feed the same `FrameStats` to the overlay and you can see whether a spike came
from drawing or from the step.

## What it is good for

- **Confirming an offload.** A main-thread job freezes the graph; the same job on
  a worker does not. That comparison is the worked example in
  [`examples/worker-offload`](https://github.com/Pierre-Demessence/Entity-Cornponent-System-Engine/tree/main/examples/worker-offload).
- **Catching catch-up steps.** With a fixed timestep, a graph that stays poor
  while the sim is fixed usually means the frame is earning several steps —
  see [Run physics on a fixed timestep](../fixed-timestep/).
- **Comparing storage shapes.** `examples/stress-storage` isolates sim, render and
  frame timings to compare the ECS store against flat typed arrays.

## Keep it out of the frame budget you are measuring

The overlay draws text and a graph every frame. That cost is small but it is
inside the number you are reading, so take it out before you quote a figure.

## See also

- [`modules/stats`](../../modules/stats/) — the module.
- [Run physics on a fixed timestep](../fixed-timestep/) — why a frame can earn
  several simulation steps.
- [Move heavy work off the main thread](../worker-offload/) — the change this
  measurement justifies.
