import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import { EcsWorld } from '@pierre/ecs';
import { degToRad } from '@pierre/ecs/modules/math';

import {
  BallTag,
  BrickDef,
  BrickTag,
  PaddleTag,
  PositionDef,
  RenderableDef,
  RenderOrderDef,
  VelocityDef,
} from './components';

export const SCREEN_W = 600;
export const SCREEN_H = 720;

export const WALL = 14;
export const PLAY_LEFT = WALL;
export const PLAY_RIGHT = SCREEN_W - WALL;
export const PLAY_TOP = WALL;

export const PADDLE_W_FULL = 96;
export const PADDLE_W_NARROW = 60;
export const PADDLE_H = 16;
export const PADDLE_Y = SCREEN_H - 48;
export const PADDLE_SPEED = 560;

export const BALL_R = 8;
export const BALL_SPEED_START = 320;
export const BALL_SPEED_MAX = 660;
export const BALL_SPEED_STEP = 8;
/** Steepest launch/bounce angle off vertical, keeps the ball from near-horizontal stalls. */
export const BALL_MAX_BOUNCE = degToRad(60);

export const BRICK_ROWS = 8;
export const BRICK_COLS = 14;
export const BRICK_GAP = 4;
export const BRICK_TOP = 64;
export const BRICK_H = 22;
export const BRICK_AREA_W = PLAY_RIGHT - PLAY_LEFT;
export const BRICK_W = (BRICK_AREA_W - BRICK_GAP * (BRICK_COLS + 1)) / BRICK_COLS;

export const START_LIVES = 3;

/** Row palette + score, top rows worth more (classic Breakout banding). */
export const ROW_COLORS: readonly string[] = [
  '#d7263d',
  '#f24f1d',
  '#f57d1f',
  '#f2b705',
  '#6cbf3a',
  '#28a76f',
  '#2a8fbf',
  '#5b4bbf',
];
const ROW_POINTS: readonly number[] = [7, 7, 5, 5, 3, 3, 1, 1];

export type BreakoutAction = 'left' | 'right' | 'launch' | 'reset';

export interface GameState {
  ballId: EntityId | null;
  best: number;
  bricksLeft: number;
  dead: boolean;
  dtMs: number;
  events: EventBus<never>;
  input: InputState<BreakoutAction>;
  launched: boolean;
  lives: number;
  narrowed: boolean;
  paddleId: EntityId | null;
  paddleW: number;
  /** Launch queued by a canvas pointer press, consumed next tick. */
  pointerLaunch: boolean;
  /** Absolute pointer x within the canvas, or null when the mouse isn't tracking. */
  pointerX: number | null;
  score: number;
  speed: number;
  won: boolean;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(BrickDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerTag(BallTag);
  w.registerTag(PaddleTag);
  w.registerTag(BrickTag);
  return w;
}

export function paddleLeft(state: GameState): number {
  return state.world.getStore(PositionDef).get(state.paddleId!)!.x;
}

function spawnPaddle(state: GameState): EntityId {
  const id = state.world.createEntity();
  const x = (SCREEN_W - state.paddleW) / 2;
  state.world.getStore(PositionDef).set(id, { x, y: PADDLE_Y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: '#e8eef7',
    h: PADDLE_H,
    kind: 'rect',
    lineWidth: 2,
    stroke: '#9fb0c4',
    w: state.paddleW,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 10 });
  state.world.getTag(PaddleTag).add(id);
  return id;
}

function spawnBall(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: SCREEN_W / 2, y: PADDLE_Y - BALL_R - 1 });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'center',
    fill: '#ffd23f',
    kind: 'circle',
    lineWidth: 2,
    radius: BALL_R,
    stroke: '#3a2c00',
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 20 });
  state.world.getTag(BallTag).add(id);
  return id;
}

function spawnBricks(state: GameState): void {
  for (let row = 0; row < BRICK_ROWS; row++) {
    const y = BRICK_TOP + row * (BRICK_H + BRICK_GAP);
    for (let col = 0; col < BRICK_COLS; col++) {
      const x = PLAY_LEFT + BRICK_GAP + col * (BRICK_W + BRICK_GAP);
      const id = state.world.createEntity();
      state.world.getStore(PositionDef).set(id, { x, y });
      state.world.getStore(BrickDef).set(id, { points: ROW_POINTS[row], row });
      state.world.getStore(RenderableDef).set(id, {
        anchor: 'top-left',
        fill: ROW_COLORS[row],
        h: BRICK_H,
        kind: 'rect',
        lineWidth: 1,
        stroke: 'rgba(0,0,0,0.35)',
        w: BRICK_W,
      });
      state.world.getStore(RenderOrderDef).set(id, { value: 5 });
      state.world.getTag(BrickTag).add(id);
      state.bricksLeft += 1;
    }
  }
}

/** Park the ball on the paddle, ready for the next launch. */
export function placeBallOnPaddle(state: GameState): void {
  if (state.ballId == null || state.paddleId == null)
    return;
  const pos = state.world.getStore(PositionDef).get(state.ballId)!;
  pos.x = paddleLeft(state) + state.paddleW / 2;
  pos.y = PADDLE_Y - BALL_R - 1;
  state.world.getStore(VelocityDef).set(state.ballId, { vx: 0, vy: 0 });
  state.launched = false;
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.bricksLeft = 0;
  state.dead = false;
  state.won = false;
  state.launched = false;
  state.narrowed = false;
  state.score = 0;
  state.lives = START_LIVES;
  state.speed = BALL_SPEED_START;
  state.paddleW = PADDLE_W_FULL;
  state.paddleId = spawnPaddle(state);
  state.ballId = spawnBall(state);
  spawnBricks(state);
  placeBallOnPaddle(state);
}
