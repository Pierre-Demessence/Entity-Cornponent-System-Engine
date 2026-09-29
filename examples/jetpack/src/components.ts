import type { TagDef } from '@pierre/ecs';

/** Axis-aligned size, anchored at the entity's top-left `PositionDef`. */
export { type ShapeAabb, ShapeAabbDef } from '@pierre/ecs/modules/collision';
export {
  RenderableDef,
  RenderOrderDef,
} from '@pierre/ecs/modules/render-canvas2d';
export {
  type Position,
  PositionDef,
  type Velocity,
  VelocityDef,
} from '@pierre/ecs/modules/transform';

export const PlayerTag: TagDef = { name: 'player' };
export const ObstacleTag: TagDef = { name: 'obstacle' };
/** Cosmetic jet bullets; a `LifetimeDef` expires them. */
export const BulletTag: TagDef = { name: 'bullet' };
