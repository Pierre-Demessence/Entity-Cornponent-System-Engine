import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

export interface Rotation { angle: number }

export const RotationDef: ComponentDef<Rotation> = {
  name: 'rotation',
  serialize: v => ({ angle: v.angle }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return { angle: asNumber(obj.angle, `${label}.angle`) };
  },
};
