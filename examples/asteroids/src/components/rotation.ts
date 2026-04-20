import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface Rotation { angle: number }

export const RotationDef: ComponentDef<Rotation> = simpleComponent<Rotation>(
  'rotation',
  { angle: 'number' },
);
