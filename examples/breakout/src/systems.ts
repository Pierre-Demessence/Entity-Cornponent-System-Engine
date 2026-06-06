import type { SchedulableSystem } from '@pierre/ecs';

import type { GameState } from './game';

import { bounceOffAabb } from '@pierre/ecs/modules/collision';
import { clamp } from '@pierre/ecs/modules/math';
import { makeVelocityIntegrationSystem, scaleToSpeed } from '@pierre/ecs/modules/motion';

import { BrickDef, BrickTag, PositionDef, RenderableDef, VelocityDef } from './components';
import {
  BALL_MAX_BOUNCE,
  BALL_R,
  BALL_SPEED_MAX,
  BALL_SPEED_STEP,
  BRICK_H,
  BRICK_W,
  PADDLE_H,
  PADDLE_SPEED,
  PADDLE_W_NARROW,
  PADDLE_Y,
  paddleLeft,
  placeBallOnPaddle,
  PLAY_LEFT,
  PLAY_RIGHT,
  PLAY_TOP,
  SCREEN_H,
} from './game';

/** Rescale the ball's velocity vector to the current target speed. */
function setBallSpeed(state: GameState, vx: number, vy: number): void {
  const ball = state.world.getStore(VelocityDef).get(state.ballId!)!;
  const v = scaleToSpeed(vx, vy, state.speed);
  ball.vx = v.x;
  ball.vy = v.y;
}

export const paddleInputSystem: SchedulableSystem<GameState> = {
  name: 'paddleInput',
  run(ctx) {
    if (ctx.dead || ctx.paddleId == null)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.paddleId)!;
    const minX = PLAY_LEFT;
    const maxX = PLAY_RIGHT - ctx.paddleW;

    let dir = 0;
    if (ctx.input.isDown('left'))
      dir -= 1;
    if (ctx.input.isDown('right'))
      dir += 1;

    if (dir !== 0) {
      // Keyboard takes over and releases the mouse from steering.
      ctx.pointerX = null;
      pos.x += dir * PADDLE_SPEED * (ctx.dtMs / 1000);
    }
    else if (ctx.pointerX != null) {
      pos.x = ctx.pointerX - ctx.paddleW / 2;
    }
    pos.x = clamp(pos.x, minX, maxX);
  },
};

export const launchSystem: SchedulableSystem<GameState> = {
  name: 'launch',
  runAfter: ['paddleInput'],
  run(ctx) {
    if (ctx.dead || ctx.ballId == null)
      return;
    if (ctx.launched)
      return;

    const pos = ctx.world.getStore(PositionDef).get(ctx.ballId)!;
    pos.x = paddleLeft(ctx) + ctx.paddleW / 2;
    pos.y = PADDLE_Y - BALL_R - 1;

    if (ctx.input.justPressed('launch') || ctx.pointerLaunch) {
      ctx.pointerLaunch = false;
      ctx.launched = true;
      const angle = (Math.random() * 2 - 1) * (BALL_MAX_BOUNCE * 0.5);
      setBallSpeed(ctx, Math.sin(angle), -Math.cos(angle));
    }
  },
};

export const motionSystem = makeVelocityIntegrationSystem<GameState>({
  name: 'motion',
  runAfter: ['launch'],
});

export const wallBounceSystem: SchedulableSystem<GameState> = {
  name: 'wallBounce',
  runAfter: ['motion'],
  run(ctx) {
    if (ctx.dead || ctx.ballId == null || !ctx.launched)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.ballId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.ballId)!;

    if (pos.x - BALL_R < PLAY_LEFT) {
      pos.x = PLAY_LEFT + BALL_R;
      vel.vx = Math.abs(vel.vx);
    }
    else if (pos.x + BALL_R > PLAY_RIGHT) {
      pos.x = PLAY_RIGHT - BALL_R;
      vel.vx = -Math.abs(vel.vx);
    }

    if (pos.y - BALL_R < PLAY_TOP) {
      pos.y = PLAY_TOP + BALL_R;
      vel.vy = Math.abs(vel.vy);
      // Stretch goal: the paddle narrows the first time the ball reaches the ceiling.
      if (!ctx.narrowed && ctx.paddleId != null) {
        ctx.narrowed = true;
        ctx.paddleW = PADDLE_W_NARROW;
        const renderable = ctx.world.getStore(RenderableDef).get(ctx.paddleId);
        if (renderable && renderable.kind === 'rect')
          renderable.w = PADDLE_W_NARROW;
      }
    }
  },
};

export const paddleBounceSystem: SchedulableSystem<GameState> = {
  name: 'paddleBounce',
  runAfter: ['wallBounce'],
  run(ctx) {
    if (ctx.dead || ctx.ballId == null || ctx.paddleId == null || !ctx.launched)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.ballId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.ballId)!;
    if (vel.vy <= 0)
      return;

    const left = paddleLeft(ctx);
    const top = PADDLE_Y;
    const withinX = pos.x + BALL_R >= left && pos.x - BALL_R <= left + ctx.paddleW;
    const hitTop = pos.y + BALL_R >= top && pos.y < top + PADDLE_H;
    if (!withinX || !hitTop)
      return;

    pos.y = top - BALL_R - 0.5;
    const offset = (pos.x - (left + ctx.paddleW / 2)) / (ctx.paddleW / 2);
    const angle = clamp(offset, -1, 1) * BALL_MAX_BOUNCE;
    setBallSpeed(ctx, Math.sin(angle), -Math.cos(angle));
  },
};

export const brickCollisionSystem: SchedulableSystem<GameState> = {
  name: 'brickCollision',
  runAfter: ['wallBounce'],
  run(ctx) {
    if (ctx.dead || ctx.ballId == null || !ctx.launched)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.ballId)!;
    const vel = ctx.world.getStore(VelocityDef).get(ctx.ballId)!;
    const posStore = ctx.world.getStore(PositionDef);
    const brickStore = ctx.world.getStore(BrickDef);

    const ballAabb = { h: BALL_R * 2, w: BALL_R * 2, x: pos.x - BALL_R, y: pos.y - BALL_R };

    for (const id of ctx.world.getTag(BrickTag)) {
      const brick = brickStore.get(id);
      const bp = posStore.get(id);
      if (!brick || !bp)
        continue;

      const r = bounceOffAabb(ballAabb, { x: vel.vx, y: vel.vy }, { h: BRICK_H, w: BRICK_W, x: bp.x, y: bp.y });
      if (!r)
        continue;

      pos.x += r.pushOut.x;
      pos.y += r.pushOut.y;
      vel.vx = r.velocity.x;
      vel.vy = r.velocity.y;

      ctx.world.queueDestroy(id);
      ctx.bricksLeft -= 1;
      ctx.score += brick.points;
      ctx.speed = Math.min(BALL_SPEED_MAX, ctx.speed + BALL_SPEED_STEP);
      setBallSpeed(ctx, vel.vx, vel.vy);
      return;
    }
  },
};

export const outcomeSystem: SchedulableSystem<GameState> = {
  name: 'outcome',
  runAfter: ['brickCollision', 'paddleBounce'],
  run(ctx) {
    if (ctx.dead)
      return;

    if (ctx.bricksLeft <= 0) {
      ctx.won = true;
      ctx.dead = true;
      ctx.best = Math.max(ctx.best, ctx.score);
      return;
    }

    if (ctx.ballId == null || !ctx.launched)
      return;
    const pos = ctx.world.getStore(PositionDef).get(ctx.ballId)!;
    if (pos.y - BALL_R > SCREEN_H) {
      ctx.lives -= 1;
      if (ctx.lives <= 0) {
        ctx.dead = true;
        ctx.best = Math.max(ctx.best, ctx.score);
      }
      else {
        placeBallOnPaddle(ctx);
      }
    }
  },
};
