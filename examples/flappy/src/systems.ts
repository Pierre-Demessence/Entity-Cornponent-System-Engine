import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from './game';

import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';

import { PipeDef, PipeTag, PositionDef, VelocityDef } from './components';
import {
  BIRD_R,
  CEIL_Y,
  FLAP_VELOCITY,
  FLOOR_Y,
  GRAVITY,
  MAX_FALL_SPEED,
  PIPE_SPAWN_MS,
  PIPE_W,
  spawnPipe,
} from './game';

/** True when circle (cx,cy,r) overlaps axis-aligned rect (rx,ry,rw,rh). */
function circleVsRect(cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number): boolean {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw));
  const nearestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= r * r;
}

function freeze(ctx: GameState): void {
  ctx.dead = true;
  ctx.best = Math.max(ctx.best, ctx.score);
  for (const id of ctx.world.getTag(PipeTag))
    ctx.world.getStore(VelocityDef).get(id)!.vx = 0;
  if (ctx.birdId != null)
    ctx.world.getStore(VelocityDef).get(ctx.birdId)!.vy = 0;
}

export const flapSystem: SchedulableSystem<GameState> = {
  name: 'flap',
  run(ctx) {
    const flap = ctx.input.justPressed('flap') || ctx.pointerFlap;
    ctx.pointerFlap = false;
    if (ctx.dead || ctx.birdId == null || !flap)
      return;
    ctx.started = true;
    ctx.world.getStore(VelocityDef).get(ctx.birdId)!.vy = FLAP_VELOCITY;
  },
};

export const gravitySystem: SchedulableSystem<GameState> = {
  name: 'gravity',
  runAfter: ['flap'],
  run(ctx) {
    if (!ctx.started || ctx.dead || ctx.birdId == null)
      return;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.birdId)!;
    vel.vy = Math.min(MAX_FALL_SPEED, vel.vy + GRAVITY * (ctx.dtMs / 1000));
  },
};

export const motionSystem = makeVelocityIntegrationSystem<GameState>({
  name: 'motion',
  runAfter: ['gravity'],
});

export const pipeSpawnSystem: SchedulableSystem<GameState> = {
  name: 'pipeSpawn',
  run(ctx) {
    if (!ctx.started || ctx.dead)
      return;
    ctx.spawnTimerMs += ctx.dtMs;
    while (ctx.spawnTimerMs >= PIPE_SPAWN_MS) {
      ctx.spawnTimerMs -= PIPE_SPAWN_MS;
      spawnPipe(ctx);
    }
  },
};

export const scoreSystem: SchedulableSystem<GameState> = {
  name: 'score',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.dead || ctx.birdId == null)
      return;
    const posStore = ctx.world.getStore(PositionDef);
    const pipeStore = ctx.world.getStore(PipeDef);
    const birdX = posStore.get(ctx.birdId)!.x;
    for (const id of ctx.world.getTag(PipeTag)) {
      const pipe = pipeStore.get(id);
      if (!pipe || pipe.scored)
        continue;
      if (posStore.get(id)!.x + PIPE_W / 2 < birdX) {
        pipe.scored = true;
        ctx.score += 1;
      }
    }
  },
};

export const pipeRecycleSystem: SchedulableSystem<GameState> = {
  name: 'pipeRecycle',
  runAfter: ['motion'],
  run(ctx) {
    const posStore = ctx.world.getStore(PositionDef);
    for (const id of ctx.world.getTag(PipeTag)) {
      if (posStore.get(id)!.x + PIPE_W / 2 < 0)
        ctx.world.queueDestroy(id);
    }
  },
};

export const collisionSystem: SchedulableSystem<GameState> = {
  name: 'collision',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.dead || ctx.birdId == null)
      return;
    const birdPos = ctx.world.getStore(PositionDef).get(ctx.birdId)!;
    const birdVel = ctx.world.getStore(VelocityDef).get(ctx.birdId)!;

    if (birdPos.y - BIRD_R < CEIL_Y) {
      birdPos.y = CEIL_Y + BIRD_R;
      if (birdVel.vy < 0)
        birdVel.vy = 0;
    }

    if (birdPos.y + BIRD_R >= FLOOR_Y) {
      birdPos.y = FLOOR_Y - BIRD_R;
      freeze(ctx);
      return;
    }

    const posStore = ctx.world.getStore(PositionDef);
    const pipeStore = ctx.world.getStore(PipeDef);
    for (const id of ctx.world.getTag(PipeTag)) {
      const pipe = pipeStore.get(id);
      if (!pipe)
        continue;
      const left = posStore.get(id)!.x - PIPE_W / 2;
      const topH = pipe.gapY - pipe.gapHalf;
      const botY = pipe.gapY + pipe.gapHalf;
      const hitTop = circleVsRect(birdPos.x, birdPos.y, BIRD_R, left, CEIL_Y, PIPE_W, topH);
      const hitBottom = circleVsRect(birdPos.x, birdPos.y, BIRD_R, left, botY, PIPE_W, FLOOR_Y - botY);
      if (hitTop || hitBottom) {
        freeze(ctx);
        return;
      }
    }
  },
};
