# `@pierre/ecs/modules/lifetime`

Countdown-to-destroy component and system. Canon pattern: Unreal
`AActor::SetLifeSpan`, Unity `Destroy(obj, t)`, Gregory *Game Engine
Architecture* §12.5.

Built on `modules/timer`: `Lifetime` is a `'once'` `Timer`, so it also
exposes `fraction()` (elapsed `[0,1]`) for fade-outs.

## API

```ts
type Lifetime = Timer;            // from modules/timer, mode 'once'

const LifetimeDef: ComponentDef<Lifetime>;

function makeLifetime(durationMs: number): Lifetime;

interface LifetimeTickCtx { dtMs: number; world: EcsWorld }

interface LifetimeSystemOptions<TCtx extends LifetimeTickCtx> {
  name?: string;
  runAfter?: string[];
  onExpire?: (ctx: TCtx, id: EntityId) => void;
}

function makeLifetimeSystem<TCtx extends LifetimeTickCtx>(
  options?: LifetimeSystemOptions<TCtx>,
): SchedulableSystem<TCtx>;
```

`makeLifetimeSystem` returns a schedulable system that, each tick, advances
every `LifetimeDef` instance via `tickTimer` and destroys entities whose
lifetime has finished. Construct values with `makeLifetime(durationMs)`.

## `onExpire` contract

When `onExpire` is provided, the callback **owns cleanup** — the engine
does not auto-destroy. If the callback does not call
`ctx.world.queueDestroy(id)` (or otherwise remove the lifetime
component), the entity will re-expire on the next tick. Exceptions
thrown by the callback halt the remaining expiry loop for that tick.

## Usage

```ts
import { LifetimeDef, makeLifetime, makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';

world.registerComponent(LifetimeDef);
scheduler.add(makeLifetimeSystem({ runAfter: ['movement'] }));

// spawn a projectile that vanishes after 2s
world.spawn({
  components: [{ def: LifetimeDef, value: makeLifetime(2000) }, /* ... */],
});
```

The tick context must satisfy `LifetimeTickCtx` — i.e. provide `dtMs`
and `world`. For continuous-time games this comes from a
`FixedIntervalTickSource`'s `deltaMs`; turn-based games typically don't
need lifetime at all, but can pass a nominal `dtMs` per turn if they do.

Import via `@pierre/ecs/modules/lifetime`. Depends on `modules/timer`.
