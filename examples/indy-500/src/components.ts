import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export { type Position, PositionDef } from '@pierre/ecs/modules/transform';

/** Drive state and race bookkeeping for one car. */
export interface Car {
  /** Best completed lap in ms, or 0 before the first. */
  bestLapMs: number;
  finished: boolean;
  heading: number;
  isAi: boolean;
  /** Laps completed. */
  laps: number;
  /** Race time at which the current lap began, in ms. */
  lapStartMs: number;
  /** Signed distance driven along the track since the start line (negative behind it). */
  progress: number;
  /** Last measured arc length on the track. */
  s: number;
  /** Points in the crash-and-score and tag modes. */
  score: number;
  /** 0 or 1: which player this car belongs to. */
  slot: number;
  speed: number;
  /** Wheel input for this tick, `[-1, 1]`, set by the control systems. */
  steer: number;
  /** Pedal input for this tick, `[-1, 1]`, set by the control systems. */
  throttle: number;
}

export const CarDef: ComponentDef<Car> = simpleComponent<Car>('car', {
  bestLapMs: 'number',
  finished: 'boolean',
  heading: 'number',
  isAi: 'boolean',
  laps: 'number',
  lapStartMs: 'number',
  progress: 'number',
  s: 'number',
  score: 'number',
  slot: 'number',
  speed: 'number',
  steer: 'number',
  throttle: 'number',
});

export const CarTag: TagDef = { name: 'car' };
