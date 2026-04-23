import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import type { PlayerId } from './components';

import { EcsWorld } from '@pierre/ecs';

import {
  BallDef,
  BallTag,
  PaddleDef,
  PaddleTag,
  Player,

  PositionDef,
  SizeDef,
  VelocityDef,
} from './components';

export const SCREEN_W = 960;
export const SCREEN_H = 540;
export const LOGIC_TICK_MS = 1000 / 60;

export const COURT_MARGIN = 24;
export const PADDLE_GAP = 36;
export const PADDLE_W = 18;
export const PADDLE_H = 96;
export const PADDLE_SPEED = 420;

export const BALL_SIZE = 16;
export const BALL_LAUNCH_SPEED = 360;
export const BALL_SPEED_STEP = 24;
export const MAX_BALL_SPEED = 720;
export const MAX_BOUNCE_ANGLE = Math.PI / 3;

export const WINNING_SCORE = 11;

export type PongAction = 'down' | 'up';
export type MetaAction = 'restart';

export interface Scores {
  left: number;
  right: number;
}

export type LocalPongEvent
  = | { type: 'GoalScored'; scorer: PlayerId; scores: Scores }
    | { type: 'MatchWon'; winner: PlayerId };

export interface GameState {
  ballId: EntityId | null;
  events: EventBus<LocalPongEvent>;
  inputs: Record<PlayerId, InputState<PongAction>>;
  metaInput: InputState<MetaAction>;
  paddleIds: Record<PlayerId, EntityId | null>;
  scores: Scores;
  serveToward: PlayerId;
  winner: PlayerId | null;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(VelocityDef);
  world.registerComponent(SizeDef);
  world.registerComponent(PaddleDef);
  world.registerComponent(BallDef);
  world.registerTag(PaddleTag);
  world.registerTag(BallTag);
  return world;
}

export function cloneScores(scores: Scores): Scores {
  return { left: scores.left, right: scores.right };
}

function paddleSpawnX(owner: PlayerId): number {
  return owner === Player.Left
    ? COURT_MARGIN + PADDLE_GAP
    : SCREEN_W - COURT_MARGIN - PADDLE_GAP - PADDLE_W;
}

function centerY(height: number): number {
  return SCREEN_H / 2 - height / 2;
}

export function spawnPaddle(state: GameState, owner: PlayerId): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: paddleSpawnX(owner), y: centerY(PADDLE_H) });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(SizeDef).set(id, { h: PADDLE_H, w: PADDLE_W });
  state.world.getStore(PaddleDef).set(id, { owner });
  state.world.getTag(PaddleTag).add(id);
  return id;
}

export function spawnBall(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, {
    x: SCREEN_W / 2 - BALL_SIZE / 2,
    y: SCREEN_H / 2 - BALL_SIZE / 2,
  });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(SizeDef).set(id, { h: BALL_SIZE, w: BALL_SIZE });
  state.world.getStore(BallDef).set(id, {
    launchSpeed: BALL_LAUNCH_SPEED,
    speedStep: BALL_SPEED_STEP,
  });
  state.world.getTag(BallTag).add(id);
  return id;
}

function serveVelocity(state: GameState, toward: PlayerId): { vx: number; vy: number } {
  const direction = toward === Player.Right ? 1 : -1;
  const totalPoints = state.scores.left + state.scores.right;
  const verticalSign = totalPoints % 2 === 0 ? 1 : -1;
  return {
    vx: BALL_LAUNCH_SPEED * direction,
    vy: BALL_LAUNCH_SPEED * 0.28 * verticalSign,
  };
}

function centerPaddles(state: GameState): void {
  const posStore = state.world.getStore(PositionDef);
  const velStore = state.world.getStore(VelocityDef);

  for (const owner of [Player.Left, Player.Right] as const) {
    const paddleId = state.paddleIds[owner];
    if (paddleId == null)
      continue;
    const pos = posStore.get(paddleId);
    const vel = velStore.get(paddleId);
    if (!pos || !vel)
      continue;
    pos.x = paddleSpawnX(owner);
    pos.y = centerY(PADDLE_H);
    vel.vx = 0;
    vel.vy = 0;
  }
}

function centerBall(state: GameState): { vx: number; vy: number } | null {
  if (state.ballId == null)
    return null;

  const ballPos = state.world.getStore(PositionDef).get(state.ballId);
  const ballVel = state.world.getStore(VelocityDef).get(state.ballId);
  if (!ballPos || !ballVel)
    return null;

  ballPos.x = SCREEN_W / 2 - BALL_SIZE / 2;
  ballPos.y = SCREEN_H / 2 - BALL_SIZE / 2;
  return ballVel;
}

export function resetRound(state: GameState): void {
  centerPaddles(state);

  const ballVel = centerBall(state);
  if (!ballVel)
    return;

  const nextVelocity = serveVelocity(state, state.serveToward);
  ballVel.vx = nextVelocity.vx;
  ballVel.vy = nextVelocity.vy;
}

export function freezeMatch(state: GameState): void {
  centerPaddles(state);

  const ballVel = centerBall(state);
  if (!ballVel)
    return;

  ballVel.vx = 0;
  ballVel.vy = 0;
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.scores.left = 0;
  state.scores.right = 0;
  state.serveToward = Player.Right;
  state.winner = null;

  state.paddleIds.left = spawnPaddle(state, Player.Left);
  state.paddleIds.right = spawnPaddle(state, Player.Right);
  state.ballId = spawnBall(state);
  resetRound(state);
}
