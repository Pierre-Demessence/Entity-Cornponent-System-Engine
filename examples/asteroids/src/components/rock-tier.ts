import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

export interface RockTier { tier: number }

export const RockTierDef: ComponentDef<RockTier> = {
  name: 'rockTier',
  serialize: v => ({ tier: v.tier }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return { tier: asNumber(obj.tier, `${label}.tier`) };
  },
};
