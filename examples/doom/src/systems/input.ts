import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { GroundedDef, Velocity3DDef } from '../components';
import { AIR_CONTROL, JUMP_IMPULSE, MOVE_SPEED } from '../game';

/**
 * First-person movement: WASD drives velocity on the XZ plane relative to the
 * look yaw, space jumps (edge-triggered + grounded-gated). Yaw/pitch are owned
 * by the DOM pointer-lock layer and read from `ctx.yaw`.
 *
 * Basis at yaw 0: forward = -Z, right = +X. On the ground velocity is *set*
 * (responsive); airborne it's nudged (limited air control) so a jump keeps its
 * momentum.
 */
export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.playerId == null)
      return;

    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId);
    const grounded = ctx.world.getStore(GroundedDef).get(ctx.playerId);
    if (!vel || !grounded)
      return;

    if (ctx.dead) {
      vel.vx = 0;
      vel.vz = 0;
      return;
    }

    let localX = 0;
    let localZ = 0;
    if (ctx.input.isDown('forward'))
      localZ += 1;
    if (ctx.input.isDown('back'))
      localZ -= 1;
    if (ctx.input.isDown('left'))
      localX -= 1;
    if (ctx.input.isDown('right'))
      localX += 1;
    const len = Math.hypot(localX, localZ);
    if (len > 0) {
      localX /= len;
      localZ /= len;
    }

    const sin = Math.sin(ctx.yaw);
    const cos = Math.cos(ctx.yaw);
    const desiredVx = (localX * cos - localZ * sin) * MOVE_SPEED;
    const desiredVz = (-localX * sin - localZ * cos) * MOVE_SPEED;
    if (grounded.onGround) {
      vel.vx = desiredVx;
      vel.vz = desiredVz;
    }
    else {
      vel.vx += (desiredVx - vel.vx) * AIR_CONTROL;
      vel.vz += (desiredVz - vel.vz) * AIR_CONTROL;
    }

    if (ctx.input.justPressed('jump') && grounded.onGround) {
      vel.vy = JUMP_IMPULSE;
      grounded.onGround = false;
    }
  },
};
