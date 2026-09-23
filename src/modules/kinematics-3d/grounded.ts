import type { ComponentDef } from '#index';

import { simpleComponent } from '#index';

/**
 * Per-entity ground-contact flag, the 3D sibling of `modules/kinematics`'
 * `Grounded`. Kinematic resolution sets `onGround = true` when the body lands on
 * a static during the Y sweep, and clears it at the start of every tick.
 *
 * **Optional on a body.** A body without `Grounded3` is still simulated
 * (gravity + axis resolution) — it just reports no ground contact and never
 * steps up. That is what lets one game mix player-like bodies (which want jump
 * logic) with free-moving ones (doom's enemies) under the same system.
 */
export interface Grounded3 {
  onGround: boolean;
}

export const Grounded3Def: ComponentDef<Grounded3> = simpleComponent<Grounded3>(
  'grounded3d',
  { onGround: 'boolean' },
);
