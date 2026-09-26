import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/** 3D velocity component — `vx` / `vy` / `vz` per second. */
export interface Velocity3D { vx: number; vy: number; vz: number }

export const Velocity3DDef: ComponentDef<Velocity3D> = simpleComponent<Velocity3D>(
  'velocity3d',
  { vx: 'number', vy: 'number', vz: 'number' },
);
