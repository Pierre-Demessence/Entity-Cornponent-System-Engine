import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/**
 * Per-entity ground contact flag. Kinematic resolution sets
 * `onGround = true` when the body lands on a static during a
 * downward sweep; cleared at the start of each vertical move.
 */
export interface Grounded {
  onGround: boolean;
}

export const GroundedDef: ComponentDef<Grounded> = simpleComponent<Grounded>(
  'grounded',
  { onGround: 'boolean' },
);
