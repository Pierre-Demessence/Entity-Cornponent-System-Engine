import type { ComponentDef, EcsWorld, EntityId, SchedulableSystem } from '#index';
import type { Timer } from '../timer';

import { simpleComponent } from '#index';

import { finished, makeTimer, tickTimer, timerSchema } from '../timer';

/** A countdown-to-destroy timer. A `'once'` {@link Timer}. */
export type Lifetime = Timer;

export const LifetimeDef: ComponentDef<Lifetime> = simpleComponent<Lifetime>(
  'lifetime',
  timerSchema,
);

/** Create a {@link Lifetime} that expires after `durationMs`. */
export function makeLifetime(durationMs: number): Lifetime {
  return makeTimer(durationMs, 'once');
}

export interface LifetimeTickCtx { dtMs: number; world: EcsWorld }

export interface LifetimeSystemOptions<TCtx extends LifetimeTickCtx> {
  name?: string;
  runAfter?: string[];
  /**
   * Called when an entity expires. When provided, the callback owns
   * cleanup — the engine does not auto-destroy. If the callback does
   * not call `ctx.world.queueDestroy(id)` (or otherwise remove the
   * lifetime component), the entity will re-expire on the next tick.
   * Exceptions thrown by the callback halt the remaining expiry loop.
   */
  onExpire?: (ctx: TCtx, id: EntityId) => void;
}

export function makeLifetimeSystem<TCtx extends LifetimeTickCtx>(
  options: LifetimeSystemOptions<TCtx> = {},
): SchedulableSystem<TCtx> {
  const { name = 'lifetime', onExpire, runAfter } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const store = ctx.world.getStore(LifetimeDef);
      const expired: EntityId[] = [];
      for (const id of store.keys()) {
        const life = store.get(id)!;
        tickTimer(life, ctx.dtMs);
        if (finished(life))
          expired.push(id);
      }
      for (const id of expired) {
        if (onExpire)
          onExpire(ctx, id);
        else ctx.world.queueDestroy(id);
      }
    },
  };
}
