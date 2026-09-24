import type { ComponentDef } from '#index';
import type { Quat } from '../math';

import { simpleComponent } from '#index';

/**
 * The 3D orientation payload: the engine's `Quat` (scalar `w` first) under the
 * transform name. The 3D counterpart of the 2D `RotationDef`'s scalar `angle` —
 * a quaternion is the canonical way to store a 3-axis attitude without gimbal
 * lock. The conventional default is `QUAT_IDENTITY` from `../math`; an
 * entity without the component is unrotated.
 */
export type Rotation3D = Quat;

export const Rotation3DDef: ComponentDef<Rotation3D> = simpleComponent<Rotation3D>(
  'rotation3d',
  { w: 'number', x: 'number', y: 'number', z: 'number' },
);
