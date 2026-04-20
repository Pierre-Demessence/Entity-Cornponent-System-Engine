import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

export interface Position { x: number; y: number }

export const PositionDef: ComponentDef<Position> = {
  name: 'position',
  serialize: v => ({ x: v.x, y: v.y }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return {
      x: asNumber(obj.x, `${label}.x`),
      y: asNumber(obj.y, `${label}.y`),
    };
  },
};
