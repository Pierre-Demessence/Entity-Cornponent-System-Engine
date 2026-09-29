import type { SchedulableSystem } from '@pierre/ecs';

import type { PlayerId } from './components';
import type { GameState } from './game';

import { aabbVsAabb } from '@pierre/ecs/modules/collision';
import { clamp } from '@pierre/ecs/modules/math';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';

import { BallDef, PaddleDef, PaddleTag, Player, PositionDef, ShapeAabbDef, VelocityDef } from './components';
import {
  cloneScores,
  COURT_MARGIN,
  freezeMatch,

  MAX_BALL_SPEED,
  MAX_BOUNCE_ANGLE,
  PADDLE_SPEED,
  resetRound,
  SCREEN_H,
  SCREEN_W,
  WINNING_SCORE,
} from './game';

function scorePoint(ctx: GameState, scorer: PlayerId): void {
  ctx.scores[scorer] += 1;
  ctx.events.emit({
    scorer,
    scores: cloneScores(ctx.scores),
    type: 'GoalScored',
  });

  if (ctx.scores[scorer] >= WINNING_SCORE) {
    ctx.winner = scorer;
    freezeMatch(ctx);
    ctx.events.emit({ type: 'MatchWon', winner: scorer });
    return;
  }

  ctx.serveToward = ctx.serveToward === Player.Left ? Player.Right : Player.Left;
  resetRound(ctx);
}

export const inputSystem: SchedulableSystem<GameState> = {
  name: 'input',
  run(ctx) {
    const velStore = ctx.world.getStore(VelocityDef);
    const paddleStore = ctx.world.getStore(PaddleDef);

    for (const paddleId of ctx.world.getTag(PaddleTag)) {
      const paddle = paddleStore.get(paddleId);
      const vel = velStore.get(paddleId);
      if (!paddle || !vel)
        continue;

      vel.vx = 0;
      vel.vy = 0;

      if (ctx.winner)
        continue;

      const input = ctx.inputs[paddle.owner];
      if (input.isDown('up'))
        vel.vy -= PADDLE_SPEED;
      if (input.isDown('down'))
        vel.vy += PADDLE_SPEED;
    }
  },
};

/** Integrates every body (paddles and ball) by its velocity. */
export const movementSystem = makeVelocityIntegrationSystem<GameState>({ name: 'movement', runAfter: ['input'] });

/** Keeps each paddle inside the court after integration. */
export const paddleBoundsSystem: SchedulableSystem<GameState> = {
  name: 'paddle-bounds',
  runAfter: ['movement'],
  run(ctx) {
    const posStore = ctx.world.getStore(PositionDef);
    const sizeStore = ctx.world.getStore(ShapeAabbDef);
    for (const paddleId of ctx.world.getTag(PaddleTag)) {
      const pos = posStore.get(paddleId);
      const size = sizeStore.get(paddleId);
      if (pos && size)
        pos.y = clamp(pos.y, COURT_MARGIN, SCREEN_H - COURT_MARGIN - size.h);
    }
  },
};

export const collisionSystem: SchedulableSystem<GameState> = {
  name: 'collision',
  run(ctx) {
    if (ctx.winner || ctx.ballId == null)
      return;

    const posStore = ctx.world.getStore(PositionDef);
    const sizeStore = ctx.world.getStore(ShapeAabbDef);
    const velStore = ctx.world.getStore(VelocityDef);
    const paddleStore = ctx.world.getStore(PaddleDef);
    const ballStore = ctx.world.getStore(BallDef);

    const ballPos = posStore.get(ctx.ballId);
    const ballVel = velStore.get(ctx.ballId);
    const ballSize = sizeStore.get(ctx.ballId);
    const ball = ballStore.get(ctx.ballId);
    if (!ballPos || !ballVel || !ballSize || !ball)
      return;

    if (ballPos.y <= COURT_MARGIN) {
      ballPos.y = COURT_MARGIN;
      ballVel.vy = Math.abs(ballVel.vy);
    }
    else if (ballPos.y + ballSize.h >= SCREEN_H - COURT_MARGIN) {
      ballPos.y = SCREEN_H - COURT_MARGIN - ballSize.h;
      ballVel.vy = -Math.abs(ballVel.vy);
    }

    for (const paddleId of ctx.world.getTag(PaddleTag)) {
      const paddle = paddleStore.get(paddleId);
      const paddlePos = posStore.get(paddleId);
      const paddleSize = sizeStore.get(paddleId);
      if (!paddle || !paddlePos || !paddleSize)
        continue;

      const isApproaching = paddle.owner === Player.Left ? ballVel.vx < 0 : ballVel.vx > 0;
      if (!isApproaching)
        continue;

      if (!aabbVsAabb(
        { h: ballSize.h, w: ballSize.w, x: ballPos.x, y: ballPos.y },
        { h: paddleSize.h, w: paddleSize.w, x: paddlePos.x, y: paddlePos.y },
      )) {
        continue;
      }

      const direction = paddle.owner === Player.Left ? 1 : -1;
      const speed = Math.min(MAX_BALL_SPEED, Math.hypot(ballVel.vx, ballVel.vy) + ball.speedStep);
      const ballCenterY = ballPos.y + ballSize.h / 2;
      const paddleCenterY = paddlePos.y + paddleSize.h / 2;
      const normalizedImpact = clamp((ballCenterY - paddleCenterY) / (paddleSize.h / 2), -1, 1);
      const bounceAngle = normalizedImpact * MAX_BOUNCE_ANGLE;

      ballPos.x = direction > 0
        ? paddlePos.x + paddleSize.w
        : paddlePos.x - ballSize.w;
      ballVel.vx = Math.cos(bounceAngle) * speed * direction;
      ballVel.vy = Math.sin(bounceAngle) * speed;
      break;
    }
  },
};

export const scoreSystem: SchedulableSystem<GameState> = {
  name: 'score',
  run(ctx) {
    if (ctx.winner || ctx.ballId == null)
      return;

    const ballPos = ctx.world.getStore(PositionDef).get(ctx.ballId);
    const ballSize = ctx.world.getStore(ShapeAabbDef).get(ctx.ballId);
    if (!ballPos || !ballSize)
      return;

    if (ballPos.x + ballSize.w < 0) {
      scorePoint(ctx, Player.Right);
      return;
    }

    if (ballPos.x > SCREEN_W) {
      scorePoint(ctx, Player.Left);
    }
  },
};
