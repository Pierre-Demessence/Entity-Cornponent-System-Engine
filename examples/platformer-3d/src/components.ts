import type { ComponentDef, TagDef } from '@pierre/ecs';
import type { Vec3 } from '@pierre/ecs/modules/math-3d';

import { simpleComponent } from '@pierre/ecs';

/** The 3D position payload: the engine's `Vec3` under the component's own name. */
export type Position3D = Vec3;
export interface Velocity3D { vx: number; vy: number; vz: number }
// Full extents (not half) along X/Y/Z, centre-based: the engine's shape under
// this game's own name.
export { type ShapeAabb3 as ShapeAabb3D, ShapeAabb3Def as ShapeAabb3DDef } from '@pierre/ecs/modules/collision-3d';
/** Ground contact: the engine's `Grounded3` under this game's own name. */
export { type Grounded3 as Grounded, Grounded3Def as GroundedDef } from '@pierre/ecs/modules/kinematics-3d';
export interface CoinValue { score: number }

export const Position3DDef: ComponentDef<Position3D> = simpleComponent<Position3D>(
  'position3d',
  { x: 'number', y: 'number', z: 'number' },
);

export const Velocity3DDef: ComponentDef<Velocity3D> = simpleComponent<Velocity3D>(
  'velocity3d',
  { vx: 'number', vy: 'number', vz: 'number' },
);

export const CoinValueDef: ComponentDef<CoinValue> = simpleComponent<CoinValue>(
  'coin-value',
  { score: 'number' },
);

export const PlayerTag: TagDef = { name: 'player' };
export const StaticBodyTag: TagDef = { name: 'static-body' };
export const CoinTag: TagDef = { name: 'coin' };
