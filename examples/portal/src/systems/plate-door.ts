import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { CubeTag, PlayerTag, Position3DDef, ShapeAabb3DDef } from '../components';
import {
  DOOR_CLOSED_Y,
  DOOR_OPEN_Y,
  DOOR_SPEED,
  EXIT_X,
  PLATE_D,
  PLATE_POS,
  PLATE_TRIGGER_H,
  PLATE_W,
} from '../game';

/**
 * Pressure plate + door + win check. The plate is "pressed" while the player or
 * the cube rests within the trigger volume above it; the door slides up while
 * pressed and back down when clear. Reaching the exit alcove past the door wins.
 */
export const plateDoorSystem: SchedulableSystem<GameState> = {
  name: 'plate-door',
  runAfter: ['carry'],
  run(ctx) {
    const posStore = ctx.world.getStore(Position3DDef);
    const aabbStore = ctx.world.getStore(ShapeAabb3DDef);

    const halfW = PLATE_W / 2;
    const halfD = PLATE_D / 2;
    const triggerLoY = PLATE_POS.y;
    const triggerHiY = PLATE_POS.y + PLATE_TRIGGER_H;

    let pressed = false;
    for (const tag of [PlayerTag, CubeTag]) {
      for (const id of ctx.world.getTag(tag)) {
        const p = posStore.get(id);
        const a = aabbStore.get(id);
        if (!p || !a)
          continue;
        const overlapX = Math.abs(p.x - PLATE_POS.x) <= halfW + a.w / 2;
        const overlapZ = Math.abs(p.z - PLATE_POS.z) <= halfD + a.d / 2;
        const overlapY = p.y + a.h / 2 >= triggerLoY && p.y - a.h / 2 <= triggerHiY;
        if (overlapX && overlapZ && overlapY) {
          pressed = true;
          break;
        }
      }
      if (pressed)
        break;
    }
    ctx.platePressed = pressed;

    // Slide the door toward its open/closed height.
    if (ctx.doorId != null) {
      const door = posStore.get(ctx.doorId);
      if (door) {
        const target = pressed ? DOOR_OPEN_Y : DOOR_CLOSED_Y;
        const step = DOOR_SPEED * (ctx.dtMs / 1000);
        door.y = Math.abs(target - door.y) <= step
          ? target
          : door.y + Math.sign(target - door.y) * step;
      }
    }

    if (!ctx.won && ctx.playerId != null) {
      const p = posStore.get(ctx.playerId);
      if (p && p.x > EXIT_X) {
        ctx.won = true;
        ctx.events.emit({ type: 'LevelComplete' });
      }
    }
  },
};
