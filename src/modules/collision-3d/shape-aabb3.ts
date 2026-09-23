import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/**
 * Axis-aligned bounding box shape, 3D sibling of `shape-aabb.ts`.
 *
 * Anchored on the entity's `Position3DDef` as the box **centre**, with **full
 * extents** (not half sizes) — the deliberate contrast with the 2D
 * `ShapeAabbDef`, which anchors its `{w, h}` at the top-left corner. All three
 * 3D examples already store it this way, and a centre anchor is what makes the
 * symmetric overlap maths in `narrowphase3.ts` read straight.
 *
 * Extents are in the same units as `Position3DDef` and must be non-negative.
 */
export interface ShapeAabb3 {
  d: number;
  h: number;
  w: number;
}

export const ShapeAabb3Def: ComponentDef<ShapeAabb3> = simpleComponent<ShapeAabb3>(
  'shape-aabb3d',
  { d: 'number', h: 'number', w: 'number' },
  { requires: ['position3d'] },
);
