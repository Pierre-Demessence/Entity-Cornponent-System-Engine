import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { PositionDef, RotationDef, VelocityDef } from '../components';
import {
  FIRE_COOLDOWN_MS,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  spawnBullet,
} from '../game';

/**
 * Player input system.
 *
 * WASD / arrows drive velocity (normalized so diagonal is not faster).
 * Rotation is continuous: the `PointerProvider` state on `ctx.pointer`
 * gives the aim vector in canvas-internal pixels; we just
 * `atan2(y - py, x - px)` to get the barrel angle.
 * Fire is hold-to-shoot with a fixed cooldown — the `fire` action
 * binds both `Pointer.LeftButton` and `Key.Space`, so the input
 * module tracks held state uniformly.
 */
export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.dead || ctx.playerId == null)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.playerId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.playerId)!;
    const rot = ctx.world.getStore(RotationDef).get(ctx.playerId)!;

    let dx = 0;
    let dy = 0;
    if (ctx.input.isDown('left'))
      dx -= 1;
    if (ctx.input.isDown('right'))
      dx += 1;
    if (ctx.input.isDown('up'))
      dy -= 1;
    if (ctx.input.isDown('down'))
      dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      vel.vx = (dx / len) * PLAYER_SPEED;
      vel.vy = (dy / len) * PLAYER_SPEED;
    }
    else {
      vel.vx = 0;
      vel.vy = 0;
    }

    const ax = ctx.pointer.x - pos.x;
    const ay = ctx.pointer.y - pos.y;
    if (ax !== 0 || ay !== 0)
      rot.angle = Math.atan2(ay, ax);

    ctx.fireCooldownMs = Math.max(0, ctx.fireCooldownMs - ctx.dtMs);
    if (ctx.input.isDown('fire') && ctx.fireCooldownMs === 0) {
      const nx = pos.x + Math.cos(rot.angle) * PLAYER_RADIUS;
      const ny = pos.y + Math.sin(rot.angle) * PLAYER_RADIUS;
      spawnBullet(ctx, nx, ny, rot.angle);
      ctx.fireCooldownMs = FIRE_COOLDOWN_MS;
    }
  },
};
