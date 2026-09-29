import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

/** Position, attitude + velocity: the engine's 3D transform components under this game's names. */
export { type Position3D, Position3DDef, type Rotation3D, Rotation3DDef, type Velocity3D, Velocity3DDef } from '@pierre/ecs/modules/transform-3d';
export interface Radius { r: number }
export interface Target { hp: number }
export interface Bullet { ttl: number }

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
/** The chase camera entity (its `Camera3D` lens and `ChaseRig`). */
export const CameraTag: TagDef = { name: 'camera-entity' };
export const BulletTag: TagDef = { name: 'bullet' };
export const TargetTag: TagDef = { name: 'target' };
