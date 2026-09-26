import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/** 2D velocity component — `vx` / `vy` per second, integrated by `makeVelocityIntegrationSystem`. */
export interface Velocity { vx: number; vy: number }

export const VelocityDef: ComponentDef<Velocity> = simpleComponent<Velocity>(
  'velocity',
  { vx: 'f32', vy: 'f32' },
);
