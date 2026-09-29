import type { ComponentDef, TagDef } from '@pierre/ecs';
import type { Fsm } from '@pierre/ecs/modules/fsm';

import type { Heading } from './movement';

import { simpleComponent } from '@pierre/ecs';

export { SpriteAnimatorDef } from '@pierre/ecs/modules/animation';
export { LifetimeDef } from '@pierre/ecs/modules/lifetime';
export { ParticleDef, ParticleTag } from '@pierre/ecs/modules/particles';
export {
  OpacityDef,
  RenderableDef,
  RenderOrderDef,
  ScreenSpaceDef,
} from '@pierre/ecs/modules/render-canvas2d';
export {
  PositionDef,
  RotationDef,
  ScaleDef,
  VelocityDef,
} from '@pierre/ecs/modules/transform';

export type GhostState = 'chase' | 'eaten' | 'enter' | 'exit' | 'frightened' | 'house' | 'scatter';

export type Mode = 'chase' | 'scatter';

export const HeadingDef: ComponentDef<Heading> = simpleComponent<Heading>('heading', { dx: 'number', dy: 'number' });

/** The integer tile a stationary thing sits on; the spatial index is built over this, not over `PositionDef`. */
export interface Tile { x: number; y: number }

export const TileDef: ComponentDef<Tile> = simpleComponent<Tile>('tile', { x: 'number', y: 'number' });

/** The turn Pac-Man is waiting to make at the next intersection that allows it. */
export interface Want { dx: number; dy: number }

export const WantDef: ComponentDef<Want> = simpleComponent<Want>('want', { dx: 'number', dy: 'number' });

export interface Ghost {
  /** Dots that must be eaten before this ghost leaves the house. */
  dotLimit: number;
  /** Set when Pac-Man catches it frightened; its brain notices on the next tick. */
  eaten: boolean;
  /** The power-pellet count it last turned frightened for, so one pellet frightens it once. */
  epoch: number;
  kind: string;
  /** Set to make it turn back at the next intersection. */
  reverse: boolean;
  /** Progress along a scripted house path. */
  waypoint: number;
}

export const GhostDef: ComponentDef<Ghost> = simpleComponent<Ghost>('ghost', {
  dotLimit: 'number',
  eaten: 'boolean',
  epoch: 'number',
  kind: 'string',
  reverse: 'boolean',
  waypoint: 'number',
});

/** A ghost's finite-state machine value, stored as a component so it lives and dies with the entity. */
export const BrainDef: ComponentDef<Fsm<GhostState>> = simpleComponent<Fsm<GhostState>>('brain', {
  current: 'string',
  elapsedMs: 'number',
});

export const PacTag: TagDef = { name: 'pac' };
export const GhostTag: TagDef = { name: 'ghost' };
export const DotTag: TagDef = { name: 'dot' };
export const PowerTag: TagDef = { name: 'power' };
export const FruitTag: TagDef = { name: 'fruit' };
export const PopupTag: TagDef = { name: 'popup' };
