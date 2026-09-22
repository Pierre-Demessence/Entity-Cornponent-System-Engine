import type { ComponentDef, TagDef } from '@pierre/ecs';
import type { Vec3 } from '@pierre/ecs/modules/math-3d';

import { simpleComponent } from '@pierre/ecs';

/** The 3D position payload: the engine's `Vec3` under the component's own name. */
export type Position3D = Vec3;
export interface Velocity3D { vx: number; vy: number; vz: number }
export interface Radius { r: number }
export interface Target { hp: number }
export interface Bullet { ttl: number }

export const Position3DDef: ComponentDef<Position3D> = simpleComponent<Position3D>(
  'position3d',
  { x: 'number', y: 'number', z: 'number' },
);

export const Velocity3DDef: ComponentDef<Velocity3D> = simpleComponent<Velocity3D>(
  'velocity3d',
  { vx: 'number', vy: 'number', vz: 'number' },
);

export const RadiusDef: ComponentDef<Radius> = simpleComponent<Radius>(
  'radius',
  { r: 'number' },
);

export const TargetDef: ComponentDef<Target> = simpleComponent<Target>(
  'target',
  { hp: 'number' },
);

export const BulletDef: ComponentDef<Bullet> = simpleComponent<Bullet>(
  'bullet',
  { ttl: 'number' },
);

export const ShipTag: TagDef = { name: 'ship' };
export const BulletTag: TagDef = { name: 'bullet' };
export const TargetTag: TagDef = { name: 'target' };
