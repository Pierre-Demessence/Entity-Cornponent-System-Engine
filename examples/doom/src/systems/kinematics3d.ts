import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { makeKinematics3DSystem } from '@pierre/ecs/modules/kinematics-3d';

import {
  DynamicBodyTag,
  Position3DDef,
  StaticBodyTag,
  Velocity3DDef,
} from '../components';
import { GRAVITY, MAX_FALL_SPEED, STEP_HEIGHT } from '../game';

/**
 * 3D AABB kinematics for every {@link DynamicBodyTag} body — gravity → X → Z →
 * Y, with shallowest-penetration push-out against {@link StaticBodyTag}
 * colliders, plus the step-up a grounded body needs to walk the arena stairs
 * (`STEP_HEIGHT`). Enemies carry no `Grounded3`, so they are fully simulated but
 * never step up — the engine's `modules/kinematics-3d`.
 *
 * Brute-force over the statics — one arena has a handful; a 3D broadphase is
 * engine roadmap work, not example work.
 */
export const kinematics3dSystem: SchedulableSystem<GameState> = makeKinematics3DSystem<GameState>({
  name: 'kinematics3d',
  dynamicTag: DynamicBodyTag,
  gravity: GRAVITY,
  positionDef: Position3DDef,
  runAfter: ['input', 'ai', 'elevator'],
  staticTag: StaticBodyTag,
  stepHeight: STEP_HEIGHT,
  terminalVelocity: MAX_FALL_SPEED,
  velocityDef: Velocity3DDef,
  broadphase: ctx => ctx.world.getTag(StaticBodyTag),
});
