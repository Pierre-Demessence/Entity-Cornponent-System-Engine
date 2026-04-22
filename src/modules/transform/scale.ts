import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

export interface Scale { x: number; y: number }

export const ScaleDef: ComponentDef<Scale> = simpleComponent<Scale>(
  'scale',
  { x: 'number', y: 'number' },
);
