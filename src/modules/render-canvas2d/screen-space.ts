import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/**
 * Marks an entity for screen-space rendering — its `PositionDef` is
 * interpreted as pixel coordinates on the canvas, independent of any
 * camera `view` transform.  Entities without this tag are drawn in
 * world space through the camera.
 */
export interface ScreenSpace {
  value: boolean;
}

export const ScreenSpaceDef: ComponentDef<ScreenSpace> = simpleComponent<ScreenSpace>('screenSpace', {
  value: 'boolean',
});
