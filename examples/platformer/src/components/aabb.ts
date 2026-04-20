import type { ComponentDef } from '@pierre/ecs';

import { asNumber, asObject } from '@pierre/ecs';

/** Full-size axis-aligned bounding box (not half-extents). Anchor = position = top-left. */
export interface Aabb { h: number; w: number }

export const AabbDef: ComponentDef<Aabb> = {
  name: 'aabb',
  serialize: v => ({ h: v.h, w: v.w }),
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    return {
      h: asNumber(obj.h, `${label}.h`),
      w: asNumber(obj.w, `${label}.w`),
    };
  },
};
