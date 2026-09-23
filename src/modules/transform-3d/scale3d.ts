import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/** Per-axis scale multiplier — the 3D sibling of the 2D `Scale` `{x, y}`. */
export interface Scale3D { x: number; y: number; z: number }

export const Scale3DDef: ComponentDef<Scale3D> = simpleComponent<Scale3D>(
  'scale3d',
  { x: 'number', y: 'number', z: 'number' },
);
