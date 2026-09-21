import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export { PositionDef } from '@pierre/ecs/modules/transform';
export { VelocityDef } from '@pierre/ecs/modules/transform';

export const BoidTag: TagDef = { name: 'boid' };
export const FoodTag: TagDef = { name: 'food' };

/** Per-boid wander state — the current offset angle on its wander circle. */
export interface Wander {
  angle: number;
}
export const WanderDef: ComponentDef<Wander> = simpleComponent<Wander>(
  'wander',
  { angle: 'number' },
);
