import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

export interface Position { x: number; y: number }

export const PositionDef: ComponentDef<Position> = simpleComponent<Position>(
  'position',
  { x: 'f32', y: 'f32' },
);
