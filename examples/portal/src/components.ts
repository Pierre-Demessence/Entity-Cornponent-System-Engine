import type { TagDef } from '@pierre/ecs';

// Full extents (not half) along X/Y/Z, centre-based: the engine's shape under
// this game's own name.
export { type ShapeAabb3 as ShapeAabb3D, ShapeAabb3Def as ShapeAabb3DDef } from '@pierre/ecs/modules/collision-3d';
/** Ground contact: the engine's `Grounded3` under this game's own name. */
export { type Grounded3 as Grounded, Grounded3Def as GroundedDef } from '@pierre/ecs/modules/kinematics-3d';
/** Position + velocity: the engine's 3D transform components under this game's names. */
export { type Position3D, Position3DDef, type Velocity3D, Velocity3DDef } from '@pierre/ecs/modules/transform-3d';

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
