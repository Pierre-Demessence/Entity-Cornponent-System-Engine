import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

export interface Radius { r: number }

export const RadiusDef: ComponentDef<Radius> = {
  name: 'radius',
  serialize: v => ({ r: v.r }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return { r: asNumber(obj.r, `${label}.r`) };
  },
};
