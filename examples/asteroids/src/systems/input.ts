import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { truncate } from '@pierre/ecs/modules/steering';

import { CooldownDef, PositionDef, ready, RotationDef, trigger, VelocityDef } from '../components';
import {
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
      const capped = truncate({ x: vel.vx, y: vel.vy }, SHIP_MAX_SPEED);
      vel.vx = capped.x;
      vel.vy = capped.y;
    }

    const cd = ctx.world.getStore(CooldownDef).get(ctx.shipId)!;
    if (ctx.input.isDown('fire') && ready(cd)) {
      const nx = pos.x + Math.cos(rot.angle) * SHIP_RADIUS;
      const ny = pos.y + Math.sin(rot.angle) * SHIP_RADIUS;
      spawnBullet(ctx, nx, ny, rot.angle);
      trigger(cd);
    }
  },
};
