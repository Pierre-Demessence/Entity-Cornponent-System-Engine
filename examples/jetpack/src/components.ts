import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

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

/** Axis-aligned size, paired with a top-left PositionDef for AABB tests + drawing. */
export interface Size {
  h: number;
  w: number;
}

export const SizeDef: ComponentDef<Size> = simpleComponent<Size>('size', {
  h: 'number',
  w: 'number',
});

export const PlayerTag: TagDef = { name: 'player' };
export const ObstacleTag: TagDef = { name: 'obstacle' };
export const BulletTag: TagDef = { name: 'bullet' };
export const ParticleTag: TagDef = { name: 'particleBody' };
