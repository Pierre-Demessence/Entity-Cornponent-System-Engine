import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export {
  OpacityDef,
  RenderableDef,
  RenderOrderDef,
} from '@pierre/ecs/modules/render-canvas2d';
export {
  type Position,
  PositionDef,
  type Velocity,
  VelocityDef,
} from '@pierre/ecs/modules/transform';

/** Axis-aligned size, paired with a top-left PositionDef for AABB tests + drawing. */
export interface Size {
  h: number;
  w: number;
}

export const SizeDef: ComponentDef<Size> = simpleComponent<Size>('size', {
  h: 'number',
  w: 'number',
});

/** Grid invader. `row` drives its sprite tier; `points` is the kill score. */
export interface Alien {
  col: number;
  points: number;
  row: number;
}

export const AlienDef: ComponentDef<Alien> = simpleComponent<Alien>('alien', {
  col: 'number',
  points: 'number',
  row: 'number',
});

/** A bunker brick. Removed from the world when destroyed. */
export interface Bunker {
  hp: number;
}

export const BunkerDef: ComponentDef<Bunker> = simpleComponent<Bunker>('bunker', {
  hp: 'number',
});

export const PlayerTag: TagDef = { name: 'player' };
export const AlienTag: TagDef = { name: 'alien' };
export const RocketTag: TagDef = { name: 'rocket' };
export const BombTag: TagDef = { name: 'bomb' };
export const MothershipTag: TagDef = { name: 'mothership' };
export const BunkerTag: TagDef = { name: 'bunkerBrick' };
