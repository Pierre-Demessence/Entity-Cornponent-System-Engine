import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/**
 * Sphere shape, 3D sibling of `shape-circle.ts`. Anchored on the entity's
 * `Position3DDef` as the sphere **centre**; the radius is a scalar in the same
 * units as `Position3DDef`.
 *
 * The field is named `radius` rather than `r` to match three.js `Sphere.radius`
 * and Godot `Sphere.radius`; a consumer whose component currently says `r`
 * renames on adoption.
 */
export interface ShapeSphere3 {
  radius: number;
}

export const ShapeSphere3Def: ComponentDef<ShapeSphere3> = simpleComponent<ShapeSphere3>(
  'shape-sphere3d',
  { radius: 'number' },
  { requires: ['position3d'] },
);
