import type { ComponentDef } from '#index';
import type { Vec3 } from '../math';

import { simpleComponent } from '#index';

/** The 3D position payload: the engine's `Vec3` under the transform name. */
export type Position3D = Vec3;

export const Position3DDef: ComponentDef<Position3D> = simpleComponent<Position3D>(
  'position3d',
  { x: 'number', y: 'number', z: 'number' },
);
