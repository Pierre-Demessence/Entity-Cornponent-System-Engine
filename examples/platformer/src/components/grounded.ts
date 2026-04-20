import type { ComponentDef } from '@pierre/ecs';

import { asBoolean, asObject } from '@pierre/ecs';

export interface Grounded { onGround: boolean }

export const GroundedDef: ComponentDef<Grounded> = {
  name: 'grounded',
  serialize: v => ({ onGround: v.onGround }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return { onGround: asBoolean(obj.onGround, `${label}.onGround`) };
  },
};
