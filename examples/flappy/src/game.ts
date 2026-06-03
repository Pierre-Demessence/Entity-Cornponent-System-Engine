import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import { EcsWorld } from '@pierre/ecs';

import {
  BirdTag,
  PipeDef,
  PipeTag,
  PositionDef,
  RenderableDef,
  RenderOrderDef,
  VelocityDef,
} from './components';

export const SCREEN_W = 480;
export const SCREEN_H = 640;

export const FLOOR_H = 80;
export const FLOOR_Y = SCREEN_H - FLOOR_H;
export const CEIL_Y = 0;

export const BIRD_X = 130;
export const BIRD_R = 13;
export const GRAVITY = 1500;
export const FLAP_VELOCITY = -430;
export const MAX_FALL_SPEED = 560;

export const PIPE_W = 64;
export const PIPE_GAP = 170;
export const PIPE_SPEED = 150;
export const PIPE_SPAWN_MS = 1500;
export const PIPE_MARGIN = 60;

export type FlappyAction = 'flap' | 'reset';

export interface GameState {
  best: number;
  birdId: EntityId | null;
  dead: boolean;
  dtMs: number;
  events: EventBus<never>;
  input: InputState<FlappyAction>;
  /** Click/tap flap queued by the canvas pointer listener, consumed each tick. */
  pointerFlap: boolean;
  score: number;
  spawnTimerMs: number;
  started: boolean;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(PipeDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerTag(BirdTag);
  w.registerTag(PipeTag);
  return w;
}

export function spawnBird(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: BIRD_X, y: SCREEN_H * 0.4 });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'center',
    fill: '#ffd23f',
    kind: 'circle',
    lineWidth: 2,
    radius: BIRD_R,
    stroke: '#3a2c00',
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 10 });
  state.world.getTag(BirdTag).add(id);
  return id;
}

function randomGapY(): number {
  const half = PIPE_GAP / 2;
  const min = CEIL_Y + PIPE_MARGIN + half;
  const max = FLOOR_Y - PIPE_MARGIN - half;
  return min + Math.random() * (max - min);
}

export function spawnPipe(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: SCREEN_W + PIPE_W / 2, y: 0 });
  state.world.getStore(VelocityDef).set(id, { vx: -PIPE_SPEED, vy: 0 });
  state.world.getStore(PipeDef).set(id, {
    gapHalf: PIPE_GAP / 2,
    gapY: randomGapY(),
    scored: false,
  });
  state.world.getTag(PipeTag).add(id);
  return id;
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.started = false;
  state.dead = false;
  state.score = 0;
  state.spawnTimerMs = 0;
  state.birdId = spawnBird(state);
}
