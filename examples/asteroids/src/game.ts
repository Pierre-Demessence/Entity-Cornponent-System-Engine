import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { ContinuousHashGrid2D } from '@pierre/ecs/modules/spatial';

import { EcsWorld } from '@pierre/ecs';
import { AttachDef } from '@pierre/ecs/modules/attach';
import { ParticleDef, ParticleTag } from '@pierre/ecs/modules/particles';
import { OpacityDef, RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { ScaleDef } from '@pierre/ecs/modules/transform';

import {
  BulletTag,
  CooldownDef,
  LifetimeDef,
  makeCooldown,
  makeLifetime,
  PositionDef,
  RockTag,
  RockTierDef,
  RotationDef,
  ShapeCircleDef,
  ShipTag,
  ThrustFlameTag,
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

interface RockTierSpec { childTier: number; r: number; score: number; spawnChildren: number; speed: number }
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

export type AsteroidsAction = 'fire' | 'reset' | 'rotateLeft' | 'rotateRight' | 'thrust';

export interface GameState {
  dead: boolean;
  dtMs: number;
  events: EventBus<AsteroidsEvent>;
  grid: ContinuousHashGrid2D;
  input: InputState<AsteroidsAction>;
  score: number;
  shipId: EntityId | null;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(RotationDef);
  w.registerComponent(ShapeCircleDef);
  w.registerComponent(LifetimeDef);
  w.registerComponent(CooldownDef);
  w.registerComponent(RockTierDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerComponent(OpacityDef);
  w.registerComponent(ScaleDef);
  w.registerComponent(ParticleDef);
  w.registerComponent(AttachDef);
  w.registerTag(ShipTag);
  w.registerTag(RockTag);
  w.registerTag(BulletTag);
  w.registerTag(ThrustFlameTag);
  w.registerTag(ParticleTag);
  return w;
}

export function spawnShip(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: SCREEN_W / 2, y: SCREEN_H / 2 });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(RotationDef).set(id, { angle: -Math.PI / 2 });
  state.world.getStore(ShapeCircleDef).set(id, { radius: SHIP_RADIUS });
  state.world.getStore(RenderableDef).set(id, {
    closed: true,
    kind: 'polygon',
    lineWidth: 2,
    stroke: '#8cf',
    points: [
      { x: SHIP_RADIUS, y: 0 },
      { x: -SHIP_RADIUS * 0.7, y: SHIP_RADIUS * 0.7 },
      { x: -SHIP_RADIUS * 0.4, y: 0 },
      { x: -SHIP_RADIUS * 0.7, y: -SHIP_RADIUS * 0.7 },
    ],
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 10 });
  state.world.getStore(CooldownDef).set(id, makeCooldown(FIRE_COOLDOWN_MS));
  state.world.getTag(ShipTag).add(id);
  state.grid.add(id, SCREEN_W / 2, SCREEN_H / 2);

  // Persistent thrust-flame entity; opacity toggles 0 ↔ 1 based on input.
  // Position/rotation synced to ship each tick by thrustFlameSystem.
  const flameId = state.world.createEntity();
  state.world.getStore(PositionDef).set(flameId, { x: SCREEN_W / 2, y: SCREEN_H / 2 });
  state.world.getStore(RotationDef).set(flameId, { angle: -Math.PI / 2 });
  state.world.getStore(RenderableDef).set(flameId, {
    closed: false,
    kind: 'polygon',
    lineWidth: 2,
    stroke: '#fa4',
    points: [
      { x: -SHIP_RADIUS * 0.4, y: SHIP_RADIUS * 0.35 },
      { x: -SHIP_RADIUS * 1.1, y: 0 },
      { x: -SHIP_RADIUS * 0.4, y: -SHIP_RADIUS * 0.35 },
    ],
  });
  state.world.getStore(RenderOrderDef).set(flameId, { value: 9 });
  state.world.getStore(OpacityDef).set(flameId, { value: 0 });
  state.world.getStore(AttachDef).set(flameId, { parent: id, snapPosition: true, snapRotation: true });
  state.world.getTag(ThrustFlameTag).add(flameId);

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
  state.world.getStore(ShapeCircleDef).set(id, { radius: spec.r });
  state.world.getStore(RockTierDef).set(id, { tier });
  state.world.getStore(RenderableDef).set(id, {
    kind: 'circle',
    lineWidth: 1.5,
    radius: spec.r,
    stroke: '#9a9',
  });
  state.world.getTag(RockTag).add(id);
  state.grid.add(id, x, y);
  return id;
}

export function spawnBullet(state: GameState, x: number, y: number, angle: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, {
    vx: Math.cos(angle) * BULLET_SPEED,
    vy: Math.sin(angle) * BULLET_SPEED,
  });
  state.world.getStore(ShapeCircleDef).set(id, { radius: BULLET_RADIUS });
  state.world.getStore(LifetimeDef).set(id, makeLifetime(BULLET_LIFE_MS));
  state.world.getStore(RenderableDef).set(id, {
    fill: '#fe6',
    kind: 'circle',
    radius: BULLET_RADIUS,
  });
  state.world.getTag(BulletTag).add(id);
  state.grid.add(id, x, y);
  return id;
}

export function despawn(state: GameState, id: EntityId): void {
  const pos = state.world.getStore(PositionDef).get(id);
  if (pos) {
    state.grid.remove(id, pos.x, pos.y);
  }
  state.world.queueDestroy(id);
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.grid.clear();

  state.score = 0;
  state.dead = false;

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
