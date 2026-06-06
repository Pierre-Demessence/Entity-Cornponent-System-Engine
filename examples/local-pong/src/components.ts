import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

// Re-export engine renderable so entities carry a drawable shape.
export {
  type Renderable,
  RenderableDef,
} from '@pierre/ecs/modules/render-canvas2d';
// Re-export engine transform components so the game uses the canonical
// Position / Velocity that Canvas2DRenderer and collision helpers expect.
export {
  type Position,
  PositionDef,
  type Velocity,
  VelocityDef,
} from '@pierre/ecs/modules/transform';

export const Player = {
  Left: 'left',
  Right: 'right',
} as const;

export type PlayerId = typeof Player[keyof typeof Player];
export const PLAYERS: readonly PlayerId[] = [Player.Left, Player.Right];

export interface Size { h: number; w: number }
export interface Paddle { owner: PlayerId }
export interface Ball {
  launchSpeed: number;
  speedStep: number;
}

export const SizeDef: ComponentDef<Size> = simpleComponent<Size>(
  'size',
  { h: 'number', w: 'number' },
);

export const PaddleDef: ComponentDef<Paddle> = simpleComponent<Paddle>(
  'paddle',
  { owner: 'string' },
);

export const BallDef: ComponentDef<Ball> = simpleComponent<Ball>(
  'ball',
  { launchSpeed: 'number', speedStep: 'number' },
);

export const PaddleTag: TagDef = { name: 'paddle' };
export const BallTag: TagDef = { name: 'ball' };
