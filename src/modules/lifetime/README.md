# `@pierre/ecs/modules/lifetime`

Countdown-to-destroy component and system. Canon pattern: Unreal
`AActor::SetLifeSpan`, Unity `Destroy(obj, t)`, Gregory *Game Engine
Architecture* §12.5.

## API

```ts
interface Lifetime { remainingMs: number }

const LifetimeDef: ComponentDef<Lifetime>;

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

`makeLifetimeSystem` returns a schedulable system that, each tick,
decrements every `LifetimeDef` instance's `remainingMs` by `ctx.dtMs`
and destroys entities whose lifetime has expired.

## `onExpire` contract

When `onExpire` is provided, the callback **owns cleanup** — the engine
does not auto-destroy. If the callback does not call
`ctx.world.queueDestroy(id)` (or otherwise remove the lifetime
component), the entity will re-expire on the next tick. Exceptions
thrown by the callback halt the remaining expiry loop for that tick.

## Usage

```ts
import { LifetimeDef, makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';

world.registerComponent(LifetimeDef);
scheduler.add(makeLifetimeSystem({ runAfter: ['movement'] }));

// spawn a projectile that vanishes after 2s
world.spawn({
  components: [{ def: LifetimeDef, value: { remainingMs: 2000 } }, /* ... */],
});
```

The tick context must satisfy `LifetimeTickCtx` — i.e. provide `dtMs`
and `world`. For continuous-time games this comes from a
`FixedIntervalTickSource`'s `deltaMs`; turn-based games typically don't
need lifetime at all, but can pass a nominal `dtMs` per turn if they do.

Import via `@pierre/ecs/modules/lifetime`.
