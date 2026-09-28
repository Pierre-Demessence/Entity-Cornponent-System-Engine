# Run physics on a fixed timestep

If movement is integrated with the frame's elapsed time, the same game behaves
differently at 60 Hz and at 144 Hz — and badly at an uneven frame rate. The fix
is to advance the simulation in fixed steps and let rendering catch up.
`FixedAccumulatorTickSource` is that fix, built on the same `TickRunner` every
other tick source uses.

## Use the accumulator

```ts
import { Scheduler, TickRunner } from '@pierre/ecs';
import { FixedAccumulatorTickSource } from '@pierre/ecs/modules/tick';

const FIXED_DT_MS = 1000 / 60;

const source = new FixedAccumulatorTickSource({
  fixedDtMs: FIXED_DT_MS,
  maxStepsPerFrame: 8,
});

const runner = new TickRunner({
  scheduler,
  source,
  contextFactory: () => ({ dtMs: FIXED_DT_MS, world }),
  getEvents: () => events,
  getWorld: () => world,
});
```

Every tick it emits carries `deltaMs: fixedDtMs`, so systems can read `ctx.dtMs`
as a constant. Whatever the display rate, the simulation sees the same step.

## Pump it yourself

This source owns no timer. You call `advance` from the render loop you already
have, and it emits however many fixed steps that frame's elapsed time earned —
zero, one, or several on a slow frame:

```ts
let last = performance.now();

function frame(now: number): void {
  source.advance(now - last);
  last = now;
  draw();
  requestAnimationFrame(frame);
}

runner.start();
requestAnimationFrame(frame);
```

`start()` / `stop()` are no-ops on this source — they exist only so it satisfies
the same interface as the others.

## Why `maxStepsPerFrame` matters

A slow frame earns several catch-up steps. If each catch-up step is itself slow,
the next frame owes even more, and the backlog spirals — the classic death
spiral.

`maxStepsPerFrame` caps the catch-up steps per `advance()` call, and **time still
owed after the cap is dropped rather than carried**. The simulation runs briefly
slow instead of never catching up. Default `8`.

## Interpolate when you draw

Running at a fixed `dt` means a frame rarely lands exactly on a tick boundary.
`source.alpha` reports how far into the next step the current time sits — the
fraction of a fixed step already elapsed.

Reading it is a rendering concern, not a simulation one: keep the previous tick's
state alongside the current one and blend between them by `alpha` at draw time.
Without it, a simulation stepping at 60 Hz drawn on a 144 Hz display visibly
stutters.

## Choosing between the sources

`modules/tick` ships four, and the choice is about cadence rather than API:

| Cadence you want | Source |
| --- | --- |
| Physics that must not vary with frame rate | `FixedAccumulatorTickSource` |
| "Simulate at exactly N Hz", no interpolation | `FixedIntervalTickSource` |
| One tick per rendered frame | `AnimationFrameTickSource` |
| You decide when — tests, turn-based, replays | `ManualTickSource` |

See [`modules/tick`](../../modules/tick/) for the full comparison.

## See also

- [Ticks, frames and system order](../../concepts/ticks-and-order/) — why these
  are separate clocks.
- [`modules/tick`](../../modules/tick/) — the module, and each source's options.
- [Watch frame time](../debug-overlay/) — measuring what the step actually costs.
