import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import type { Run } from './save';
import type { Terrain } from './terrain';

import { EcsWorld } from '@pierre/ecs';
import { makeSpriteAnimation, SpriteAnimationDef } from '@pierre/ecs/modules/animation';
import { makeCamera } from '@pierre/ecs/modules/camera';
import { makeSeededRng } from '@pierre/ecs/modules/rng';

import {
  CameraDef,
  CameraTag,
  FlameTag,
  LanderDef,
  LanderTag,
  LifetimeDef,
  OpacityDef,
  ParticleDef,
  ParticleTag,
  PositionDef,
  RenderableDef,
  RenderOrderDef,
  ScaleDef,
  VelocityDef,
} from './components';
import { FUEL_MAX } from './landing';
import { generateTerrain, WORLD_H, WORLD_W } from './terrain';

export const VIEW_W = 800;
export const VIEW_H = 560;

export const GRAVITY = 38;
export const THRUST = 96;
export const SPIN_ACCEL = 5;
export const SPIN_DAMP = 3.2;
export const MAX_SPIN = 1.9;
export const FUEL_BURN = 9;
export const FUEL_BONUS = 40;
/** Distance from hull centre down to the foot pads. */
export const LEG_DROP = 14;
export const START_Y = 260;

export const FLAME_FRAMES = ['flame-0', 'flame-1', 'flame-2', 'flame-1'];

export type LanderAction = 'left' | 'next' | 'right' | 'thrust';

export type Phase = 'crashed' | 'flying' | 'landed';

export interface GameState {
  cameraId: EntityId | null;
  dtMs: number;
  events: EventBus<never>;
  flameId: EntityId | null;
  input: InputState<LanderAction>;
  landerId: EntityId | null;
  landings: number;
  /** Last touchdown message shown as a banner, with the ms since it appeared. */
  message: { ageMs: number; text: string } | null;
  phase: Phase;
  /** Set once the finished run has been handed to the leaderboard. */
  runRecorded: boolean;
  runs: Run[];
  score: number;
  /** Seed of the current level; the next level uses `seed + 1`. */
  seed: number;
  terrain: Terrain;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(LanderDef);
  w.registerComponent(CameraDef);
  w.registerComponent(LifetimeDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerComponent(OpacityDef);
  w.registerComponent(ScaleDef);
  w.registerComponent(ParticleDef);
  w.registerComponent(SpriteAnimationDef);
  w.registerTag(LanderTag);
  w.registerTag(FlameTag);
  w.registerTag(CameraTag);
  w.registerTag(ParticleTag);
  return w;
}

/** Start a level: fresh terrain for `seed`, lander hovering near the top with a sideways drift. */
export function startLevel(state: GameState, seed: number, fuel: number): void {
  state.world.clearAll();
  state.seed = seed;
  state.terrain = generateTerrain(seed);
  state.phase = 'flying';
  state.message = null;
  state.runRecorded = false;

  const rng = makeSeededRng(seed * 7919 + 1);
  const drift = (rng() - 0.5) * 60;
  const x = WORLD_W * (0.15 + rng() * 0.2);

  const lander = state.world.createEntity();
  state.world.getStore(PositionDef).set(lander, { x, y: START_Y });
  state.world.getStore(VelocityDef).set(lander, { vx: drift, vy: 0 });
  state.world.getStore(LanderDef).set(lander, { angle: 0, fuel, spin: 0, thrusting: false });
  state.world.getTag(LanderTag).add(lander);
  state.landerId = lander;

  // The flame is its own entity: only its animation cursor matters, the renderer draws it.
  const flame = state.world.createEntity();
  state.world.getStore(SpriteAnimationDef).set(flame, makeSpriteAnimation(FLAME_FRAMES, 18));
  state.world.getTag(FlameTag).add(flame);
  state.flameId = flame;

  const cam = state.world.createEntity();
  state.world.getStore(PositionDef).set(cam, { x, y: START_Y });
  state.world.getStore(CameraDef).set(cam, makeCamera({
    limitBottom: WORLD_H,
    limitLeft: 0,
    limitRight: WORLD_W,
    limitTop: 0,
    viewportH: VIEW_H,
    viewportW: VIEW_W,
    x,
    y: START_Y,
    zoom: 1,
  }));
  state.world.getTag(CameraTag).add(cam);
  state.cameraId = cam;
}

/** A new run from level 1 with a full tank, keeping the loaded leaderboard. */
export function newRun(state: GameState, seed: number): void {
  state.score = 0;
  state.landings = 0;
  startLevel(state, seed, FUEL_MAX);
}
