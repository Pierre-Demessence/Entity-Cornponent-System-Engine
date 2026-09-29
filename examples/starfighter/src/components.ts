import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

/** Collision radius of every body (ship, bullets, targets). */
export { type ShapeSphere3, ShapeSphere3Def } from '@pierre/ecs/modules/collision-3d';
/** Per-shot gate on the ship. */
export { CooldownDef, makeCooldown, ready, trigger } from '@pierre/ecs/modules/cooldown';
/** Bullet time-to-live. */
export { LifetimeDef, makeLifetime } from '@pierre/ecs/modules/lifetime';
/** Position, attitude + velocity: the engine's 3D transform components under this game's names. */
export { type Position3D, Position3DDef, type Rotation3D, Rotation3DDef, type Velocity3D, Velocity3DDef } from '@pierre/ecs/modules/transform-3d';

export interface Target { hp: number }

export const TargetDef: ComponentDef<Target> = simpleComponent<Target>(
  'target',
  { hp: 'number' },
);

export const ShipTag: TagDef = { name: 'ship' };
/** The chase camera entity (its `Camera3D` lens and `ChaseRig`). */
export const CameraTag: TagDef = { name: 'camera-entity' };
export const BulletTag: TagDef = { name: 'bullet' };
export const TargetTag: TagDef = { name: 'target' };
