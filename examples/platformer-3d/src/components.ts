import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

// Full extents (not half) along X/Y/Z, centre-based: the engine's shape under
// this game's own name.
export { type ShapeAabb3 as ShapeAabb3D, ShapeAabb3Def as ShapeAabb3DDef } from '@pierre/ecs/modules/collision-3d';
/** Ground contact: the engine's `Grounded3` under this game's own name. */
export { type Grounded3 as Grounded, Grounded3Def as GroundedDef } from '@pierre/ecs/modules/kinematics-3d';
/** Position + velocity: the engine's 3D transform components under this game's names. */
export { type Position3D, Position3DDef, type Velocity3D, Velocity3DDef } from '@pierre/ecs/modules/transform-3d';
export interface CoinValue { score: number }

export const CoinValueDef: ComponentDef<CoinValue> = simpleComponent<CoinValue>(
  'coin-value',
  { score: 'number' },
);

export const PlayerTag: TagDef = { name: 'player' };
export const StaticBodyTag: TagDef = { name: 'static-body' };
export const CoinTag: TagDef = { name: 'coin' };
