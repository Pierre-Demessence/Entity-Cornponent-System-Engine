import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

export interface Direction { dx: number; dy: number }

export const DirectionDef: ComponentDef<Direction> = {
  name: 'direction',
  serialize: v => ({ dx: v.dx, dy: v.dy }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return {
      dx: asNumber(obj.dx, `${label}.dx`),
      dy: asNumber(obj.dy, `${label}.dy`),
    };
  },
};
