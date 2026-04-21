import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { PositionDef, RotationDef, VelocityDef } from '../components';
import {
  FIRE_COOLDOWN_MS,

  SHIP_MAX_SPEED,
  SHIP_RADIUS,
  SHIP_ROT_RAD_PER_S,
  SHIP_THRUST,
  spawnBullet,
} from '../game';

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.dead || ctx.shipId == null)
      return;
    const dt = ctx.dtMs / 1000;
    const rot = ctx.world.getStore(RotationDef).get(ctx.shipId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.shipId)!;
    const pos = ctx.world.getStore(PositionDef).get(ctx.shipId)!;

    if (ctx.input.isDown('rotateLeft'))
      rot.angle -= SHIP_ROT_RAD_PER_S * dt;
    if (ctx.input.isDown('rotateRight'))
      rot.angle += SHIP_ROT_RAD_PER_S * dt;

    if (ctx.input.isDown('thrust')) {
      vel.vx += Math.cos(rot.angle) * SHIP_THRUST * dt;
      vel.vy += Math.sin(rot.angle) * SHIP_THRUST * dt;
      const sp = Math.hypot(vel.vx, vel.vy);
      if (sp > SHIP_MAX_SPEED) {
        vel.vx = (vel.vx / sp) * SHIP_MAX_SPEED;
        vel.vy = (vel.vy / sp) * SHIP_MAX_SPEED;
      }
    }

    ctx.fireCooldownMs = Math.max(0, ctx.fireCooldownMs - ctx.dtMs);
    if (ctx.input.isDown('fire') && ctx.fireCooldownMs === 0) {
      const nx = pos.x + Math.cos(rot.angle) * SHIP_RADIUS;
      const ny = pos.y + Math.sin(rot.angle) * SHIP_RADIUS;
      spawnBullet(ctx, nx, ny, rot.angle);
      ctx.fireCooldownMs = FIRE_COOLDOWN_MS;
    }
  },
};
