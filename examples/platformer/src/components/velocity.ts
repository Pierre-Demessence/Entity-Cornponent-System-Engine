import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

export interface Velocity { vx: number; vy: number }

export const VelocityDef: ComponentDef<Velocity> = {
  name: 'velocity',
  serialize: v => ({ vx: v.vx, vy: v.vy }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return {
      vx: asNumber(obj.vx, `${label}.vx`),
      vy: asNumber(obj.vy, `${label}.vy`),
    };
  },
};
