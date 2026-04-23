import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export const Player = {
  Left: 'left',
  Right: 'right',
} as const;

export type PlayerId = typeof Player[keyof typeof Player];
export const PLAYERS: readonly PlayerId[] = [Player.Left, Player.Right];

export interface Position { x: number; y: number }
export interface Velocity { vx: number; vy: number }
export interface Size { h: number; w: number }
export interface Paddle { owner: PlayerId }
export interface Ball {
  launchSpeed: number;
  speedStep: number;
}

export const PositionDef: ComponentDef<Position> = simpleComponent<Position>(
  'position',
  { x: 'number', y: 'number' },
);

export const VelocityDef: ComponentDef<Velocity> = simpleComponent<Velocity>(
  'velocity',
  { vx: 'number', vy: 'number' },
);

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
