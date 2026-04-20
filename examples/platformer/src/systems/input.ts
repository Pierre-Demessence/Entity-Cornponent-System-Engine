import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { GroundedDef, VelocityDef } from '../components';
import {

  JUMP_IMPULSE,
  MOVE_SPEED,
} from '../game';

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.playerId)!;
    const grounded = ctx.world.getStore(GroundedDef).get(ctx.playerId)!;

    // Horizontal movement: direct velocity (no air-control subtlety yet).
    vel.vx = 0;
    if (ctx.input.left)
      vel.vx -= MOVE_SPEED;
    if (ctx.input.right)
      vel.vx += MOVE_SPEED;

    // Edge-triggered jump
    if (ctx.input.jumpPressed && grounded.onGround) {
      vel.vy = -JUMP_IMPULSE;
      grounded.onGround = false;
    }
    ctx.input.jumpPressed = false;
  },
};
