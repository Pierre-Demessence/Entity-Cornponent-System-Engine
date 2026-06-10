import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export interface Position3D { x: number; y: number; z: number }
export interface Velocity3D { vx: number; vy: number; vz: number }
/** Full extents (not half) along X/Y/Z. AABBs are center-based. */
export interface ShapeAabb3D { d: number; h: number; w: number }
export interface Grounded { onGround: boolean }

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
