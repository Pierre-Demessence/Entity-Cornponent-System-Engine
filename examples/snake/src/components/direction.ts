import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

interface Direction { dx: number; dy: number }

export const DirectionDef: ComponentDef<Direction> = simpleComponent<Direction>(
  'direction',
  { dx: 'number', dy: 'number' },
);
