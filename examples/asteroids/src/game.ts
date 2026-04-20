import type { EntityId, EventBus } from '@pierre/ecs';
import type { HashGrid2D } from '@pierre/ecs/modules/spatial';

import { EcsWorld } from '@pierre/ecs';

import {
  BulletTag,
  LifetimeDef,
  PositionDef,
  RadiusDef,
  RockTag,
  RockTierDef,
  RotationDef,
  ShipTag,
  VelocityDef,
} from './components';

export const SCREEN_W = 800;
export const SCREEN_H = 600;
export const CELL_SIZE = 64;

export const SHIP_ROT_RAD_PER_S = 3.5;
export const SHIP_THRUST = 220;
export const SHIP_MAX_SPEED = 360;
export const SHIP_RADIUS = 12;

export const BULLET_SPEED = 480;
export const BULLET_LIFE_MS = 900;
export const BULLET_RADIUS = 2;
export const FIRE_COOLDOWN_MS = 180;

export interface RockTierSpec { childTier: number; r: number; score: number; spawnChildren: number; speed: number }
export const ROCK_TIERS: RockTierSpec[] = [
  { childTier: 1, r: 40, score: 20, spawnChildren: 2, speed: 40 },
  { childTier: 2, r: 22, score: 50, spawnChildren: 2, speed: 70 },
  { childTier: -1, r: 12, score: 100, spawnChildren: 0, speed: 110 },
];
export const ROCKS_INITIAL = 4;

export type AsteroidsEvent
  = | { type: 'RockDestroyed'; rockId: EntityId }
    | { type: 'ShipDestroyed' }
    | { type: 'GameOver' };

export interface InputState {
  fire: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
  thrust: boolean;
}

export interface GameState {
  dead: boolean;
  dtMs: number;
  events: EventBus<AsteroidsEvent>;
  fireCooldownMs: number;
  grid: HashGrid2D;
  input: InputState;
  score: number;
  shipId: EntityId | null;
  world: EcsWorld;
}

export function cellOf(x: number, y: number): { x: number; y: number } {
  return { x: Math.floor(x / CELL_SIZE), y: Math.floor(y / CELL_SIZE) };
}

export function wrap(x: number, max: number): number {
  if (x < 0)
    return x + max;
  if (x >= max)
    return x - max;
  return x;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(RotationDef);
  w.registerComponent(RadiusDef);
  w.registerComponent(LifetimeDef);
  w.registerComponent(RockTierDef);
  w.registerTag(ShipTag);
  w.registerTag(RockTag);
  w.registerTag(BulletTag);
  return w;
}

export function spawnShip(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: SCREEN_W / 2, y: SCREEN_H / 2 });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(RotationDef).set(id, { angle: -Math.PI / 2 });
  state.world.getStore(RadiusDef).set(id, { r: SHIP_RADIUS });
  state.world.getTag(ShipTag).add(id);
  const c = cellOf(SCREEN_W / 2, SCREEN_H / 2);
  state.grid.add(id, c.x, c.y);
  return id;
}

export function spawnRock(state: GameState, x: number, y: number, tier: number): EntityId {
  const spec = ROCK_TIERS[tier]!;
  const id = state.world.createEntity();
  const angle = Math.random() * Math.PI * 2;
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, {
    vx: Math.cos(angle) * spec.speed,
    vy: Math.sin(angle) * spec.speed,
  });
  state.world.getStore(RadiusDef).set(id, { r: spec.r });
  state.world.getStore(RockTierDef).set(id, { tier });
  state.world.getTag(RockTag).add(id);
  const c = cellOf(x, y);
  state.grid.add(id, c.x, c.y);
  return id;
}

export function spawnBullet(state: GameState, x: number, y: number, angle: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, {
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
  });
  state.world.getStore(RadiusDef).set(id, { r: BULLET_RADIUS });
  state.world.getStore(LifetimeDef).set(id, { remainingMs: BULLET_LIFE_MS });
  state.world.getTag(BulletTag).add(id);
  const c = cellOf(x, y);
  state.grid.add(id, c.x, c.y);
  return id;
}

export function despawn(state: GameState, id: EntityId): void {
  const pos = state.world.getStore(PositionDef).get(id);
  if (pos) {
    const c = cellOf(pos.x, pos.y);
    state.grid.remove(id, c.x, c.y);
  }
  state.world.queueDestroy(id);
}

export function resetGame(state: GameState): void {
  // Despawn everything
  const posStore = state.world.getStore(PositionDef);
  const allIds = [...posStore.keys()];
  for (const id of allIds) state.world.queueDestroy(id);
  state.world.flushDestroys();
  state.world.lifecycle.flush();
  state.grid.clear();

  state.score = 0;
  state.dead = false;
  state.fireCooldownMs = 0;
  state.input.rotateLeft = false;
  state.input.rotateRight = false;
  state.input.thrust = false;
  state.input.fire = false;

  state.shipId = spawnShip(state);

  // Spawn initial rocks at screen edges, away from centre
  for (let i = 0; i < ROCKS_INITIAL; i++) {
    const edge = Math.floor(Math.random() * 4);
    let x: number;
    let y: number;
    switch (edge) {
      case 0:
        x = Math.random() * SCREEN_W;
        y = 0;
        break;
      case 1:
        x = SCREEN_W;
        y = Math.random() * SCREEN_H;
        break;
      case 2:
        x = Math.random() * SCREEN_W;
        y = SCREEN_H;
        break;
      default:
        x = 0;
        y = Math.random() * SCREEN_H;
    }
    spawnRock(state, x, y, 0);
  }
}
