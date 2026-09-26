import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/** 2D rotation component — `angle` in radians. */
export interface Rotation { angle: number }

export const RotationDef: ComponentDef<Rotation> = simpleComponent<Rotation>(
  'rotation',
  { angle: 'number' },
);
