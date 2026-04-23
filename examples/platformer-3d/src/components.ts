import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface Position3D { x: number; y: number; z: number }
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
