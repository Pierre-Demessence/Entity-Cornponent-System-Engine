import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { GroundedDef, Velocity3DDef } from '../components';
import { AIR_CONTROL, JUMP_IMPULSE, playerLook, SPRINT_SPEED, WALK_SPEED } from '../game';

const SLOTS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'] as const;

/**
 * First-person walking: WASD sets the horizontal velocity relative to the look
 * yaw (basis at yaw 0: forward = -Z, right = +X), Shift sprints, Space jumps
 * from the ground, and 1–5 pick a hotbar slot. Airborne, velocity is only
 * nudged so a jump keeps its momentum.
 */
export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    SLOTS.forEach((action, i) => {
      if (ctx.input.justPressed(action))
        ctx.selected = i;
    });
    if (ctx.playerId == null)
      return;
    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId);
    const grounded = ctx.world.getStore(GroundedDef).get(ctx.playerId);
    if (!vel || !grounded)
      return;

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
    const speed = ctx.input.isDown('sprint') ? SPRINT_SPEED : WALK_SPEED;
    const yaw = playerLook(ctx)?.yaw ?? 0;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const desiredVx = (localX * cos - localZ * sin) * speed;
    const desiredVz = (-localX * sin - localZ * cos) * speed;
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
