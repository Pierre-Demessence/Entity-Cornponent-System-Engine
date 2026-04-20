import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface Velocity { vx: number; vy: number }

export const VelocityDef: ComponentDef<Velocity> = simpleComponent<Velocity>(
  'velocity',
  { vx: 'number', vy: 'number' },
);
