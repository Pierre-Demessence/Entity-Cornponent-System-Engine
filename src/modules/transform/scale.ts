import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/** 2D scale component — per-axis `x` / `y` multipliers. */
export interface Scale { x: number; y: number }

export const ScaleDef: ComponentDef<Scale> = simpleComponent<Scale>(
  'scale',
  { x: 'number', y: 'number' },
);
