import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface Grounded { onGround: boolean }

export const GroundedDef: ComponentDef<Grounded> = simpleComponent<Grounded>(
  'grounded',
  { onGround: 'boolean' },
);
