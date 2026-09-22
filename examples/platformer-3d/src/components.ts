import type { ComponentDef, TagDef } from '@pierre/ecs';
import type { Vec3 } from '@pierre/ecs/modules/math-3d';

import { simpleComponent } from '@pierre/ecs';

/** The 3D position payload: the engine's `Vec3` under the component's own name. */
export type Position3D = Vec3;
export interface Velocity3D { vx: number; vy: number; vz: number }
export interface ShapeAabb3D { d: number; h: number; w: number }
export interface Grounded { onGround: boolean }
export interface CoinValue { score: number }

export const Position3DDef: ComponentDef<Position3D> = simpleComponent<Position3D>(
  'position3d',
  { x: 'number', y: 'number', z: 'number' },
);

export const Velocity3DDef: ComponentDef<Velocity3D> = simpleComponent<Velocity3D>(
  'velocity3d',
  { vx: 'number', vy: 'number', vz: 'number' },
);

export const ShapeAabb3DDef: ComponentDef<ShapeAabb3D> = simpleComponent<ShapeAabb3D>(
  'shape-aabb3d',
  { d: 'number', h: 'number', w: 'number' },
);

export const GroundedDef: ComponentDef<Grounded> = simpleComponent<Grounded>(
  'grounded',
  { onGround: 'boolean' },
);

export const CoinValueDef: ComponentDef<CoinValue> = simpleComponent<CoinValue>(
  'coin-value',
  { score: 'number' },
);

export const PlayerTag: TagDef = { name: 'player' };
export const StaticBodyTag: TagDef = { name: 'static-body' };
export const CoinTag: TagDef = { name: 'coin' };
