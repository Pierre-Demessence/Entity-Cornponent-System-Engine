import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

export interface CoinValue { score: number }

export const CoinValueDef: ComponentDef<CoinValue> = {
  name: 'coinValue',
  serialize: v => ({ score: v.score }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return { score: asNumber(obj.score, `${label}.score`) };
  },
};
