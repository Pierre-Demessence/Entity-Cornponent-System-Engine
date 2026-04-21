import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/**
 * Axis-aligned bounding box shape. Anchored at `PositionDef.{x,y}` as
 * the top-left corner — matches the platformer's physics convention.
 *
 * Width and height are in the same units as `PositionDef` (pixels for
 * Canvas2D games, cells for tile games), and must be non-negative.
 */
export interface ShapeAabb {
  h: number;
  w: number;
}

export const ShapeAabbDef: ComponentDef<ShapeAabb> = simpleComponent<ShapeAabb>(
  'shape-aabb',
  { h: 'number', w: 'number' },
  { requires: ['position'] },
);
