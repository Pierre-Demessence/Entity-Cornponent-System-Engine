import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { makeKinematics3DSystem } from '@pierre/ecs/modules/kinematics-3d';

import {
  PlayerTag,
  Position3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from '../components';
import { GRAVITY, MAX_FALL_SPEED } from '../game';

/**
 * 3D kinematic body resolution — the engine's `modules/kinematics-3d`, over the
 * player only ({@link PlayerTag}). Step-up is left off: this level has no
 * stairs, and a ledge must stay something you jump. The module also brings the
 * shallowest-penetration guard, which the hand-rolled resolver this replaced
 * lacked.
 *
 * Brute-force iteration over `StaticBodyTag` — the level has ~7 statics and a
 * proper broadphase would be roadmap work, not example work.
 */
export const kinematics3dSystem: SchedulableSystem<GameState> = makeKinematics3DSystem<GameState>({
  name: 'kinematics3d',
  dynamicTag: PlayerTag,
  gravity: GRAVITY,
  positionDef: Position3DDef,
  runAfter: ['input'],
  staticTag: StaticBodyTag,
  terminalVelocity: MAX_FALL_SPEED,
  velocityDef: Velocity3DDef,
  broadphase: ctx => ctx.world.getTag(StaticBodyTag),
});
