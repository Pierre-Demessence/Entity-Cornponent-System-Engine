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

/** Vertical gap geometry + scoring flag for one pipe pair (a single entity). */
export interface Pipe {
  gapHalf: number;
  gapY: number;
  scored: boolean;
}

export const PipeDef: ComponentDef<Pipe> = simpleComponent<Pipe>('pipe', {
  gapHalf: 'number',
  gapY: 'number',
  scored: 'boolean',
});

export const BirdTag: TagDef = { name: 'bird' };
export const PipeTag: TagDef = { name: 'pipeBody' };
