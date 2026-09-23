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

export const PlayerTag: TagDef = { name: 'player' };
export const CubeTag: TagDef = { name: 'cube' };
/** Immovable colliders (floors, walls, ceiling). */
export const StaticBodyTag: TagDef = { name: 'static-body' };
/** Gravity-driven AABB bodies resolved against statics (player, cube). */
export const DynamicBodyTag: TagDef = { name: 'dynamic-body' };
/** Static surfaces the portal gun is allowed to place a portal on. */
export const PortalableSurfaceTag: TagDef = { name: 'portalable-surface' };
/** A body currently carried by the player (skips gravity/collision/teleport). */
export const HeldTag: TagDef = { name: 'held' };
/** The pressure plate (visual + trigger; not a collider). */
export const PlateTag: TagDef = { name: 'plate' };
/** The sliding door (a collider that moves up when the plate is pressed). */
export const DoorTag: TagDef = { name: 'door' };
/** Floor slabs — hidden when the tiled floor model is shown. */
export const FloorTag: TagDef = { name: 'floor' };
/** Perimeter wall slabs — hidden when the tiled wall models are shown. */
export const WallTag: TagDef = { name: 'wall' };
