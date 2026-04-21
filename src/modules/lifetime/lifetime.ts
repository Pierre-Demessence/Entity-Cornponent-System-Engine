import type { ComponentDef, EcsWorld, EntityId, SchedulableSystem } from '#index';

import { simpleComponent } from '#index';

export interface Lifetime { remainingMs: number }

export const LifetimeDef: ComponentDef<Lifetime> = simpleComponent<Lifetime>(
  'lifetime',
  { remainingMs: 'number' },
);

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
        life.remainingMs -= ctx.dtMs;
        if (life.remainingMs <= 0)
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
