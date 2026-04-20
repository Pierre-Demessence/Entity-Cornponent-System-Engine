import type { ComponentDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface Position { x: number; y: number }

export const PositionDef: ComponentDef<Position> = simpleComponent<Position>(
  'position',
  { x: 'number', y: 'number' },
);
