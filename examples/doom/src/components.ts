import type { ComponentDef, TagDef } from '@pierre/ecs';
import type { Vec3 } from '@pierre/ecs/modules/math-3d';

import { simpleComponent } from '@pierre/ecs';

/** The 3D position payload: the engine's `Vec3` under the component's own name. */
export type Position3D = Vec3;
export interface Velocity3D { vx: number; vy: number; vz: number }
/** Full extents (not half) along X/Y/Z. AABBs are center-based. */
// Full extents (not half) along X/Y/Z, centre-based: the engine's shape under
// this game's own name.
export { type ShapeAabb3 as ShapeAabb3D, ShapeAabb3Def as ShapeAabb3DDef } from '@pierre/ecs/modules/collision-3d';
export interface Grounded { onGround: boolean }
/** A platform that oscillates on Y between `minY` and `maxY`. `dir` is ±1. */
export interface Elevator { dir: number; maxY: number; minY: number; speed: number }
/** Per-entity render colour (hex), so surfaces read distinctly by role. */
export interface Tint { color: number }
/** Hit points. Death is at `hp <= 0`. */
export interface Health { hp: number; max: number }
/** Enemy brain. `mode`: 0 idle, 1 chase, 2 attack. `attackTimer` counts down ms. */
export interface Ai { attackTimer: number; mode: number }
/** Billboard sprite selector (index into the renderer's enemy texture list). */
export interface Billboard { sprite: number }
/** An in-flight projectile: `damage` on contact, `ttl` ms before it expires. */
export interface Projectile { damage: number; ttl: number }
/** A floor pickup. `kind`: 0 health, 1 hitscan ammo, 2 rocket ammo. */
export interface Pickup { amount: number; kind: number }

export const Position3DDef: ComponentDef<Position3D> = simpleComponent<Position3D>(
  'position3d',
  { x: 'number', y: 'number', z: 'number' },
);

export const Velocity3DDef: ComponentDef<Velocity3D> = simpleComponent<Velocity3D>(
  'velocity3d',
  { vx: 'number', vy: 'number', vz: 'number' },
);

export const GroundedDef: ComponentDef<Grounded> = simpleComponent<Grounded>(
  'grounded',
  { onGround: 'boolean' },
);

export const ElevatorDef: ComponentDef<Elevator> = simpleComponent<Elevator>(
  'elevator',
  { dir: 'number', maxY: 'number', minY: 'number', speed: 'number' },
);

export const TintDef: ComponentDef<Tint> = simpleComponent<Tint>(
  'tint',
  { color: 'number' },
);

export const HealthDef: ComponentDef<Health> = simpleComponent<Health>(
  'health',
  { hp: 'number', max: 'number' },
);

export const AiDef: ComponentDef<Ai> = simpleComponent<Ai>(
  'ai',
  { attackTimer: 'number', mode: 'number' },
);

export const BillboardDef: ComponentDef<Billboard> = simpleComponent<Billboard>(
  'billboard',
  { sprite: 'number' },
);

export const ProjectileDef: ComponentDef<Projectile> = simpleComponent<Projectile>(
  'projectile',
  { damage: 'number', ttl: 'number' },
);

export const PickupDef: ComponentDef<Pickup> = simpleComponent<Pickup>(
  'pickup',
  { amount: 'number', kind: 'number' },
);

export const PlayerTag: TagDef = { name: 'player' };
/** Immovable colliders (floors, walls, ceiling, stairs, ramps). */
export const StaticBodyTag: TagDef = { name: 'static-body' };
/** Gravity-driven AABB bodies resolved against statics (the player for now). */
export const DynamicBodyTag: TagDef = { name: 'dynamic-body' };
/** A static body that the elevator system oscillates vertically. */
export const ElevatorTag: TagDef = { name: 'elevator' };
/** A hostile billboard creature driven by the AI system. */
export const EnemyTag: TagDef = { name: 'enemy' };
/** A flying projectile (the rocket/bolt weapon's bullet). */
export const ProjectileTag: TagDef = { name: 'projectile' };
/** A floor pickup (health or ammo) collected by walking over it. */
export const PickupTag: TagDef = { name: 'pickup' };
