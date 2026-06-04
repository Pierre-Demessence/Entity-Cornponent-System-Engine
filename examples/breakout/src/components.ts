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

/** Per-brick score value and palette row, used by collision + render. */
export interface Brick {
  points: number;
  row: number;
}

export const BrickDef: ComponentDef<Brick> = simpleComponent<Brick>('brick', {
  points: 'number',
  row: 'number',
});

export const BallTag: TagDef = { name: 'ball' };
export const PaddleTag: TagDef = { name: 'paddle' };
export const BrickTag: TagDef = { name: 'brickBody' };
