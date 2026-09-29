import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { GroundedDef, Velocity3DDef } from '../components';
import { cameraRig, JUMP_IMPULSE, MOVE_SPEED } from '../game';

/**
 * Camera-relative WASD on the XZ plane, space-to-jump (edge-triggered
 * and grounded-gated). Camera yaw is the camera's `OrbitRig`,
 * which the DOM layer (mouse look) turns.
 *
 * Basis at yaw=0: forward = -Z world, right = +X world. Rotating by
 * `yaw` around Y gives forward = (-sin, 0, -cos), right = (cos, 0, -sin),
 * so pressing W/D always moves toward what the player sees as
 * forward/right regardless of camera angle.
 */
export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.playerId == null)
      return;

    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId)!;
    const grounded = ctx.world.getStore(GroundedDef).get(ctx.playerId)!;

    // Local input axes: +Z local = forward (away from camera),
    // +X local = right (of camera).
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

    const yaw = cameraRig(ctx)?.yaw ?? 0;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const worldX = localX * cos - localZ * sin;
    const worldZ = -localX * sin - localZ * cos;

    vel.vx = worldX * MOVE_SPEED;
    vel.vz = worldZ * MOVE_SPEED;

    if (ctx.input.justPressed('jump') && grounded.onGround) {
      vel.vy = JUMP_IMPULSE;
      grounded.onGround = false;
    }
  },
};
