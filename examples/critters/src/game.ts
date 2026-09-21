import type { EntityId } from '@pierre/ecs';
import type { PointerState } from '@pierre/ecs/modules/input';
import type { Vec2 } from '@pierre/ecs/modules/motion';
import type { WanderState } from '@pierre/ecs/modules/steering';

import { EcsWorld } from '@pierre/ecs';
import { PositionDef, VelocityDef } from '@pierre/ecs/modules/transform';

export { PositionDef, VelocityDef };

export const SCREEN_W = 800;
export const SCREEN_H = 600;

export const CRITTER_COUNT = 14;
export const CRITTER_RADIUS = 9;
export const FOOD_COUNT = 6;
export const FOOD_RADIUS = 6;

export const FLEE_SPEED = 155;
export const FORAGE_SPEED = 82;
export const HOME_SPEED = 92;
export const WANDER_SPEED = 52;

/** Meter rates per second. */
export const HUNGER_RATE = 0.05;
export const ENERGY_DRAIN = 0.035;
export const ENERGY_RECOVER = 0.28;

export const HUNGRY_AT = 0.55;
export const TIRED_AT = 0.25;
export const RESTED_AT = 0.95;

export const THREAT_RADIUS = 125;
export const EAT_DIST = 14;
export const HOME_DIST = 16;
export const ARRIVE_SLOW_RADIUS = 50;

export type Behavior = 'eat' | 'flee' | 'idle' | 'rest' | 'seekFood' | 'seekHome' | 'wander';

/**
 * A critter's blackboard: the cross-tick memory the reactive BT reads and
 * writes. The tree itself is stateless and shared; everything that must
 * persist between ticks lives here.
 */
export interface Critter {
  id: EntityId;
  /** Label of the leaf that ran this tick, for rendering. */
  behavior: Behavior;
  energy: number;
  home: Vec2;
  hunger: number;
  /** Food the critter is currently foraging, chosen by the BT's seekFood leaf. */
  targetFood: EntityId | null;
  wander: WanderState;
}

export interface GameState {
  /** Set per-critter by the BT system so leaf nodes know whose blackboard they run. */
  activeCritter: Critter | null;
  critters: Critter[];
  dtMs: number;
  elapsedMs: number;
  foodIds: EntityId[];
  pointer: PointerState;
  world: EcsWorld;
}

export const HOMES: Vec2[] = [
  { x: 110, y: 110 },
  { x: 690, y: 120 },
  { x: 400, y: 520 },
];

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  return w;
}

function spawnFood(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, {
    x: 40 + Math.random() * (SCREEN_W - 80),
    y: 40 + Math.random() * (SCREEN_H - 80),
  });
  return id;
}

export function relocateFood(state: GameState, id: EntityId): void {
  const pos = state.world.getStore(PositionDef).get(id);
  if (!pos)
    return;
  pos.x = 40 + Math.random() * (SCREEN_W - 80);
  pos.y = 40 + Math.random() * (SCREEN_H - 80);
}

function spawnCritter(state: GameState, home: Vec2): Critter {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: home.x, y: home.y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  return {
    id,
    behavior: 'idle',
    energy: 0.6 + Math.random() * 0.4,
    home,
    hunger: Math.random() * 0.4,
    targetFood: null,
    wander: { angle: Math.random() * Math.PI * 2 },
  };
}

export function critterPos(state: GameState, c: Critter): Vec2 {
  const p = state.world.getStore(PositionDef).get(c.id);
  return p ? { x: p.x, y: p.y } : { x: 0, y: 0 };
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.elapsedMs = 0;
  state.activeCritter = null;

  state.foodIds = [];
  for (let i = 0; i < FOOD_COUNT; i++)
    state.foodIds.push(spawnFood(state));

  state.critters = [];
  for (let i = 0; i < CRITTER_COUNT; i++)
    state.critters.push(spawnCritter(state, HOMES[i % HOMES.length]));
}
