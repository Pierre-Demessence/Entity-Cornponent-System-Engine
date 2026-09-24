import type { SchedulableSystem } from '@pierre/ecs';
import type { Vec3 } from '@pierre/ecs/modules/math';

import type { GameState } from '../game';

import { quatForward, quatFromAxisAngle, quatMul, quatNormalize } from '@pierre/ecs/modules/math';

import { Position3DDef, Velocity3DDef } from '../components';
import {
  AIM_DEADZONE,
  BOUNDS_RADIUS,
  MAX_SPEED,
  MIN_SPEED,
  PITCH_RATE,
  ROLL_RATE,
  SHIP_RADIUS,
  THROTTLE_ACCEL,
  TURN_RESPONSE,
  YAW_RATE,
} from '../game';

/**
 * Aim-to-steer flight, No-Man's-Sky style. The reticle deflection
 * (`aimX`/`aimY`, set by the DOM layer) sets a *target* angular velocity past a
 * central deadzone; the ship's angular velocity eases toward it so turns build
 * and settle over time rather than snapping. Roll is on A/D. Throttle (W/S)
 * accelerates the forward speed; the ship always flies along its own nose —
 * no strafing, no vertical thrust. Position is integrated by `motion` and
 * clamped to the spherical boundary by {@link shipBoundsSystem}.
 */
export const shipSystem: SchedulableSystem<GameState> = {
  name: 'ship',
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId);
    if (!vel)
      return;

    const dt = ctx.dtMs / 1000;

    // Throttle: accelerate forward/back, otherwise coast (space has no drag).
    if (ctx.input.isDown('throttleUp'))
      ctx.speed = Math.min(MAX_SPEED, ctx.speed + THROTTLE_ACCEL * dt);
    if (ctx.input.isDown('throttleDown'))
      ctx.speed = Math.max(MIN_SPEED, ctx.speed - THROTTLE_ACCEL * dt);

    // Reticle deflection → target angular velocity (past the deadzone).
    const roll = (ctx.input.isDown('rollRight') ? 1 : 0) - (ctx.input.isDown('rollLeft') ? 1 : 0);
    const target: Vec3 = {
      x: deadzone(ctx.aimY) * PITCH_RATE, // pitch about local +X (reticle up → nose up)
      y: -deadzone(ctx.aimX) * YAW_RATE, // yaw about local +Y (reticle right → nose right)
      z: -roll * ROLL_RATE, // roll about the nose axis
    };
    ctx.angVel.x += (target.x - ctx.angVel.x) * TURN_RESPONSE;
    ctx.angVel.y += (target.y - ctx.angVel.y) * TURN_RESPONSE;
    ctx.angVel.z += (target.z - ctx.angVel.z) * TURN_RESPONSE;

    // Integrate orientation: rotate by the local angular-velocity vector. The
    // module normalises the axis, so the raw vector is the axis.
    const speedRad = Math.hypot(ctx.angVel.x, ctx.angVel.y, ctx.angVel.z);
    if (speedRad > 1e-6) {
      const dq = quatFromAxisAngle(ctx.angVel, speedRad * dt);
      ctx.orientation = quatNormalize(quatMul(ctx.orientation, dq));
    }

    // Velocity follows the nose (arcade flight); `motion` integrates position.
    const fwd = quatForward(ctx.orientation);
    vel.vx = fwd.x * ctx.speed;
    vel.vy = fwd.y * ctx.speed;
    vel.vz = fwd.z * ctx.speed;
  },
};

/**
 * Clamps the ship to the spherical play boundary after `motion` has integrated
 * it, killing forward speed when it drives into the wall.
 */
export const shipBoundsSystem: SchedulableSystem<GameState> = {
  name: 'ship-bounds',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.playerId == null)
      return;
    const pos = ctx.world.getStore(Position3DDef).get(ctx.playerId);
    const vel = ctx.world.getStore(Velocity3DDef).get(ctx.playerId);
    if (!pos || !vel)
      return;

    const limit = BOUNDS_RADIUS - SHIP_RADIUS;
    const dist = Math.hypot(pos.x, pos.y, pos.z);
    if (dist > limit && dist > 0) {
      pos.x = (pos.x / dist) * limit;
      pos.y = (pos.y / dist) * limit;
      pos.z = (pos.z / dist) * limit;
      // Kill forward momentum if we're driving into the wall.
      if (vel.vx * pos.x + vel.vy * pos.y + vel.vz * pos.z > 0)
        ctx.speed = 0;
    }
  },
};

/** Remap an axis so the central `AIM_DEADZONE` produces no turn, then ramp to ±1. */
function deadzone(a: number): number {
  const m = Math.abs(a);
  if (m <= AIM_DEADZONE)
    return 0;
  const scaled = (m - AIM_DEADZONE) / (1 - AIM_DEADZONE);
  return Math.sign(a) * Math.min(1, scaled);
}
