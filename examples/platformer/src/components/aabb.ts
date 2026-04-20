import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

/** Full-size axis-aligned bounding box (not half-extents). Anchor = position = top-left. */
export interface Aabb { h: number; w: number }

export const AabbDef: ComponentDef<Aabb> = simpleComponent<Aabb>(
  'aabb',
  { h: 'number', w: 'number' },
);
