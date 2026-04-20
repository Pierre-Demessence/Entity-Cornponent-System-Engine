import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { DirectionDef, PositionDef, SnakeSegmentTag } from '../components';
import { GRID, spawnSegment } from '../game';

export const movementSystem: SchedulableSystem<GameState> = {
  name: 'movement',
  runAfter: ['input'],
  run(ctx) {
    if (ctx.dead || ctx.segments.length === 0)
      return;
    const headId = ctx.segments[0]!;
    const posStore = ctx.world.getStore(PositionDef);
    const head = posStore.get(headId)!;
    const dir = ctx.world.getStore(DirectionDef).get(headId)!;

    const nx = head.x + dir.dx;
    const ny = head.y + dir.dy;

    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) {
      ctx.events.emit({ type: 'GameOver' });
      return;
    }

    // Self-collision: any snake segment except the tail (which is about to move away)
    const occupants = ctx.world.spatial.getAt(nx, ny);
    if (occupants) {
      const tailId = ctx.segments.at(-1)!;
      const segTag = ctx.world.getTag(SnakeSegmentTag);
      for (const occ of occupants) {
        if (segTag.has(occ) && occ !== tailId) {
          ctx.events.emit({ type: 'GameOver' });
          return;
        }
      }
    }

    const ateFood = ctx.foodId != null
      && posStore.get(ctx.foodId)!.x === nx
      && posStore.get(ctx.foodId)!.y === ny;

    // Body shift: each segment moves to the position of the one ahead of it.
    const prevPositions = ctx.segments.map(id => ({ ...posStore.get(id)! }));
    ctx.world.move(headId, nx, ny);
    for (let i = 1; i < ctx.segments.length; i++) {
      const prev = prevPositions[i - 1]!;
      ctx.world.move(ctx.segments[i]!, prev.x, prev.y);
    }

    if (ateFood) {
      // Grow: append a new segment at the old tail's position
      const oldTail = prevPositions.at(-1)!;
      const newSeg = spawnSegment(ctx.world, oldTail.x, oldTail.y, false);
      ctx.segments.push(newSeg);
      ctx.world.queueDestroy(ctx.foodId!);
      ctx.foodId = null;
      ctx.score++;
      ctx.events.emit({ type: 'AppleEaten' });
    }
  },
};
