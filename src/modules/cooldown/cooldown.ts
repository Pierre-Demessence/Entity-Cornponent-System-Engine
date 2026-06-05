import type { ComponentDef, EcsWorld, SchedulableSystem } from '#index';
import type { Timer } from '../timer';

import { simpleComponent } from '#index';

import { finished, makeTimer, restart, tickTimer, timerSchema } from '../timer';

/** An action-gating cooldown. A `'once'` {@link Timer} that starts ready. */
export type Cooldown = Timer;

export const CooldownDef: ComponentDef<Cooldown> = simpleComponent<Cooldown>(
  'cooldown',
  timerSchema,
);

/** Create a {@link Cooldown} of `durationMs` that starts **ready** to fire. */
export function makeCooldown(durationMs: number): Cooldown {
  const c = makeTimer(durationMs, 'once');
  c.remainingMs = 0;
  return c;
}

/** Whether the cooldown has elapsed and the gated action may fire. */
export function ready(c: Cooldown): boolean {
  return finished(c);
}

/** Re-arm the cooldown after firing (optionally changing its duration). */
export function trigger(c: Cooldown, durationMs?: number): void {
  restart(c, durationMs);
}

export interface CooldownTickCtx { dtMs: number; world: EcsWorld }

export interface CooldownSystemOptions {
  name?: string;
  runAfter?: string[];
}

/**
 * Build a schedulable system that advances every {@link CooldownDef} each
 * tick. Consumers poll {@link ready} and re-arm with {@link trigger}.
 */
export function makeCooldownSystem<TCtx extends CooldownTickCtx>(
  options: CooldownSystemOptions = {},
): SchedulableSystem<TCtx> {
  const { name = 'cooldown', runAfter } = options;
  return {
    name,
    runAfter,
    run(ctx) {
      const store = ctx.world.getStore(CooldownDef);
      for (const id of store.keys())
        tickTimer(store.get(id)!, ctx.dtMs);
    },
  };
}
