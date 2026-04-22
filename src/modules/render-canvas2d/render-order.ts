import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/**
 * Per-entity z-order. Renderer draws entities in ascending `value`;
 * ties preserve component-store insertion order. Canon: Pixi `zIndex`,
 * Phaser `depth`, Unity sorting order, Bevy `ZIndex`.
 */
export interface RenderOrder { value: number }

export const RenderOrderDef: ComponentDef<RenderOrder> = simpleComponent<RenderOrder>(
  'renderOrder',
  { value: 'number' },
);
