import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

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

/** What an obstacle is. Cars squash; logs/turtles/crocs carry the frog. */
export type ObstacleKind = 'car' | 'croc' | 'log' | 'turtle';

/**
 * A horizontally-scrolling lane occupant. `span` is the wrap cycle length
 * (entities recycle by ±span to stay evenly spaced). Diving turtles toggle
 * `submerged` on a timer, dropping their carry support while underwater.
 */
export interface Obstacle {
  diveTimerMs: number;
  diving: boolean;
  kind: ObstacleKind;
  row: number;
  span: number;
  submerged: boolean;
}

export const ObstacleDef: ComponentDef<Obstacle> = simpleComponent<Obstacle>('obstacle', {
  diveTimerMs: 'number',
  diving: 'boolean',
  kind: 'string',
  row: 'number',
  span: 'number',
  submerged: 'boolean',
});

export const FrogTag: TagDef = { name: 'frog' };
export const ObstacleTag: TagDef = { name: 'obstacle' };
