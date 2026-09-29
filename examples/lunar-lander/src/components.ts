import type { ComponentDef, TagDef } from '@pierre/ecs';

import { simpleComponent } from '@pierre/ecs';

export { CameraDef } from '@pierre/ecs/modules/camera';
export { LifetimeDef, makeLifetime } from '@pierre/ecs/modules/lifetime';
export { ParticleDef, ParticleTag } from '@pierre/ecs/modules/particles';
export {
  OpacityDef,
  RenderableDef,
  RenderOrderDef,
} from '@pierre/ecs/modules/render-canvas2d';
export {
  type Position,
  PositionDef,
  ScaleDef,
  type Velocity,
  VelocityDef,
} from '@pierre/ecs/modules/transform';

/** Attitude and fuel state of the lander. `angle` is 0 when upright, positive clockwise. */
export interface Lander {
  angle: number;
  fuel: number;
  /** Angular velocity, rad/s. */
  spin: number;
  thrusting: boolean;
}

export const LanderDef: ComponentDef<Lander> = simpleComponent<Lander>('lander', {
  angle: 'number',
  fuel: 'number',
  spin: 'number',
  thrusting: 'boolean',
});

export const LanderTag: TagDef = { name: 'lander' };
export const FlameTag: TagDef = { name: 'flame' };
export const CameraTag: TagDef = { name: 'mainCamera' };
