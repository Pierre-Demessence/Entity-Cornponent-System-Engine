import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

export interface Lifetime { remainingMs: number }

export const LifetimeDef: ComponentDef<Lifetime> = {
  name: 'lifetime',
  serialize: v => ({ remainingMs: v.remainingMs }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return { remainingMs: asNumber(obj.remainingMs, `${label}.remainingMs`) };
  },
};
