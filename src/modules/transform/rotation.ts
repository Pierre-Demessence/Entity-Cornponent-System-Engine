import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

export interface Rotation { angle: number }

export const RotationDef: ComponentDef<Rotation> = simpleComponent<Rotation>(
  'rotation',
  { angle: 'number' },
);
