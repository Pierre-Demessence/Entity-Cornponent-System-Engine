import type { SchedulableSystem } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import type { GameState, PlayerSlot, ShipAction } from '../game';

import { scaleToSpeed } from '@pierre/ecs/modules/motion';

import { CooldownDef, PositionDef, ready, RotationDef, trigger, VelocityDef } from '../components';
import {
  SHIP_MAX_SPEED,
  SHIP_ROT_RAD_PER_S,
  SHIP_THRUST,
  spawnTorpedo,
  TORPEDO_MUZZLE_OFFSET,
} from '../game';

function processShip(
  ctx: GameState,
  shipId: NonNullable<GameState['shipIds'][PlayerSlot]>,
  input: InputState<ShipAction>,
): void {
  const dt = ctx.dtMs / 1000;
  const rot = ctx.world.getStore(RotationDef).get(shipId)!;
  const vel = ctx.world.getStore(VelocityDef).get(shipId)!;
  const pos = ctx.world.getStore(PositionDef).get(shipId)!;

  if (input.isDown('rotateLeft'))
    rot.angle -= SHIP_ROT_RAD_PER_S * dt;
  if (input.isDown('rotateRight'))
    rot.angle += SHIP_ROT_RAD_PER_S * dt;

  if (input.isDown('thrust')) {
    vel.vx += Math.cos(rot.angle) * SHIP_THRUST * dt;
    vel.vy += Math.sin(rot.angle) * SHIP_THRUST * dt;
    const sp = Math.hypot(vel.vx, vel.vy);
    if (sp > SHIP_MAX_SPEED) {
      const clamped = scaleToSpeed(vel.vx, vel.vy, SHIP_MAX_SPEED);
      vel.vx = clamped.x;
      vel.vy = clamped.y;
    }
  }

  const cd = ctx.world.getStore(CooldownDef).get(shipId)!;
  if (input.isDown('fire') && ready(cd)) {
    const nx = pos.x + Math.cos(rot.angle) * TORPEDO_MUZZLE_OFFSET;
    const ny = pos.y + Math.sin(rot.angle) * TORPEDO_MUZZLE_OFFSET;
    spawnTorpedo(ctx, nx, ny, rot.angle, vel.vx, vel.vy);
    ctx.events.emit({ type: 'TorpedoFired' });
    trigger(cd);
  }
}

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (ctx.dead)
      return;
    // `!= null` rather than truthy: EntityId 0 is a valid ship id.
    const ship1 = ctx.shipIds[1];
    if (ship1 != null)
      processShip(ctx, ship1, ctx.inputs[1]);
    const ship2 = ctx.shipIds[2];
    if (ship2 != null)
      processShip(ctx, ship2, ctx.inputs[2]);
  },
};
