import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from '../game';

import { DirectionDef } from '../components';

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    if (!ctx.pendingDir || ctx.segments.length === 0)
      return;
    const headId = ctx.segments[0]!;
    const dir = ctx.world.getStore(DirectionDef).get(headId);
    if (!dir)
      return;
    const next = ctx.pendingDir;
    // Reject 180° reversals
    if (next.dx === -dir.dx && next.dy === -dir.dy) {
      ctx.pendingDir = null;
      return;
    }
    dir.dx = next.dx;
    dir.dy = next.dy;
    ctx.pendingDir = null;
  },
};
