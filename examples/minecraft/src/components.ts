import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export { type ShapeAabb3 as ShapeAabb3D, ShapeAabb3Def as ShapeAabb3DDef } from '@pierre/ecs/modules/collision-3d';
export { CooldownDef, makeCooldown, ready, trigger } from '@pierre/ecs/modules/cooldown';
export { type Grounded3 as Grounded, Grounded3Def as GroundedDef } from '@pierre/ecs/modules/kinematics-3d';
export { type Position3D, Position3DDef, type Velocity3D, Velocity3DDef } from '@pierre/ecs/modules/transform-3d';

/**
 * One chunk of the voxel grid. `version` bumps whenever a block inside (or on
 * its border) changes, telling the renderer to remesh; `visible` is `1` when
 * the chunk's bounds intersect the camera frustum.
 */
export interface Chunk { cx: number; cz: number; version: number; visible: number }

export const ChunkDef: ComponentDef<Chunk> = simpleComponent<Chunk>(
  'chunk',
  { cx: 'number', cz: 'number', version: 'number', visible: 'number' },
);

export const PlayerTag: TagDef = { name: 'player' };
export const CameraTag: TagDef = { name: 'camera-entity' };
export const ChunkTag: TagDef = { name: 'chunk' };
