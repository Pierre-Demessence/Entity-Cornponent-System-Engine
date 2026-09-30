import type { SchedulableSystem } from '@pierre/ecs';
import type { Aabb3 } from '@pierre/ecs/modules/collision-3d';

import type { GameState } from '../game';

import { GroundedDef, Position3DDef, ShapeAabb3DDef, Velocity3DDef } from '../components';
import { GRAVITY, MAX_FALL_SPEED } from '../game';
import { sweepBox } from '../voxels';

/**
 * Gravity, then X → Z → Y voxel collision for the player. Blocks are not
 * entities, so this sweeps the player's box against the solid cells of the
 * grid it can reach (`sweepBox`, built on `aabb3VsAabb3Swept`) instead of
 * running `modules/kinematics-3d`. A downward contact sets `onGround`.
 */
export const movementSystem: SchedulableSystem<GameState> = {
  name: 'movement',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const pos = ctx.world.getStore(Position3DDef).get(ctx.playerId);
    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId);
    const shape = ctx.world.getStore(ShapeAabb3DDef).get(ctx.playerId);
    const grounded = ctx.world.getStore(GroundedDef).get(ctx.playerId);
    if (!pos || !vel || !shape || !grounded)
      return;

    const dt = ctx.dtMs / 1000;
    vel.vy = Math.max(vel.vy - GRAVITY * dt, -MAX_FALL_SPEED);
    grounded.onGround = false;

    const half = { x: shape.w / 2, y: shape.h / 2, z: shape.d / 2 };
    const box = (): Aabb3 => ({ center: pos, half });

    const moveX = sweepBox(ctx.world.grid, box(), { x: vel.vx * dt, y: 0, z: 0 });
    pos.x += moveX.motion.x;
    if (moveX.hit)
      vel.vx = 0;

    const moveZ = sweepBox(ctx.world.grid, box(), { x: 0, y: 0, z: vel.vz * dt });
    pos.z += moveZ.motion.z;
    if (moveZ.hit)
      vel.vz = 0;

    const moveY = sweepBox(ctx.world.grid, box(), { x: 0, y: vel.vy * dt, z: 0 });
    pos.y += moveY.motion.y;
    if (moveY.hit) {
      if (moveY.normal.y > 0)
        grounded.onGround = true;
      vel.vy = 0;
    }
  },
};
