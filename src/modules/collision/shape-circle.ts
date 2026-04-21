import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/**
 * Circle shape. Anchored at `PositionDef.{x,y}` as the circle's centre
 * — matches the asteroids convention where rocks, bullets, and the
 * ship all spin/move around their centre point.
 *
 * `radius` is in the same units as `PositionDef` and must be
 * non-negative.
 */
export interface ShapeCircle {
  radius: number;
}

export const ShapeCircleDef: ComponentDef<ShapeCircle> = simpleComponent<ShapeCircle>(
  'shape-circle',
  { radius: 'number' },
  { requires: ['position'] },
);
