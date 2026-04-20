import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface Radius { r: number }

export const RadiusDef: ComponentDef<Radius> = simpleComponent<Radius>(
  'radius',
  { r: 'number' },
);
