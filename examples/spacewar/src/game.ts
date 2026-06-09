import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { ContinuousHashGrid2D } from '@pierre/ecs/modules/spatial';

import { EcsWorld } from '@pierre/ecs';
import { AttachDef } from '@pierre/ecs/modules/attach';
import { ParticleDef, ParticleTag } from '@pierre/ecs/modules/particles';
import { OpacityDef, RenderableDef, RenderOrderDef } from '@pierre/ecs/modules/render-canvas2d';
import { ScaleDef } from '@pierre/ecs/modules/transform';

import {
  CooldownDef,
  LifetimeDef,
  makeCooldown,
  makeLifetime,
  PositionDef,
  RotationDef,
  ShapeCircleDef,
  Ship1Tag,
  Ship2Tag,
  StarTag,
  ThrustFlameTag,
  TorpedoTag,
  VelocityDef,
} from './components';

export const SCREEN_W = 800;
export const SCREEN_H = 600;
export const CELL_SIZE = 64;

export const SHIP_ROT_RAD_PER_S = 3.5;
export const SHIP_THRUST = 220;
export const SHIP_MAX_SPEED = 360;
export const SHIP_RADIUS = 12;

export const TORPEDO_SPEED = 420;
export const TORPEDO_LIFE_MS = 1100;
export const TORPEDO_RADIUS = 2.5;
/**
 * Muzzle offset from the ship centre. Clears `SHIP_RADIUS + TORPEDO_RADIUS` so
 * a freshly-fired torpedo never overlaps its own ship on the spawn tick.
 */
export const TORPEDO_MUZZLE_OFFSET = SHIP_RADIUS + TORPEDO_RADIUS + 3;
export const FIRE_COOLDOWN_MS = 220;

export const STAR_X = SCREEN_W / 2;
export const STAR_Y = SCREEN_H / 2;
export const STAR_RADIUS = 16;
/** Gravitational constant — scaled so ships feel a clear pull at typical combat ranges. */
export const STAR_GRAVITY = 2_000_000;
/** Minimum distance from star centre before gravity clamps (prevents singularity). */
export const STAR_GRAVITY_MIN_R = STAR_RADIUS + 8;

export const WIN_SCORE = 5;

export type PlayerSlot = 1 | 2;

export type SpacewarEvent
  = | { type: 'TorpedoFired' }
    | { type: 'ShipDestroyed' }
    | { type: 'PlayerScored'; scorer: PlayerSlot }
    | { type: 'GameOver'; winner: PlayerSlot };

export type ShipAction = 'fire' | 'rotateLeft' | 'rotateRight' | 'thrust';
export type MetaAction = 'restart';

export interface GameState {
  dead: boolean;
  dtMs: number;
  events: EventBus<SpacewarEvent>;
  grid: ContinuousHashGrid2D;
  /** Per-player input states. */
  inputs: Record<PlayerSlot, InputState<ShipAction>>;
  metaInput: InputState<MetaAction>;
  scores: Record<PlayerSlot, number>;
  shipIds: Record<PlayerSlot, EntityId | null>;
  starId: EntityId | null;
  winner: PlayerSlot | null;
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
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerComponent(OpacityDef);
  w.registerComponent(ScaleDef);
  w.registerComponent(ParticleDef);
  w.registerComponent(AttachDef);
  w.registerTag(Ship1Tag);
  w.registerTag(Ship2Tag);
  w.registerTag(TorpedoTag);
  w.registerTag(StarTag);
  w.registerTag(ThrustFlameTag);
  w.registerTag(ParticleTag);
  return w;
}

const SHIP1_COLOR = '#6cf';
const SHIP2_COLOR = '#f66';

function shipShape(radius: number): Array<{ x: number; y: number }> {
  return [
    { x: radius, y: 0 },
    { x: -radius * 0.7, y: radius * 0.7 },
    { x: -radius * 0.4, y: 0 },
    { x: -radius * 0.7, y: -radius * 0.7 },
  ];
}

function flameShape(): Array<{ x: number; y: number }> {
  return [
    { x: -SHIP_RADIUS * 0.4, y: SHIP_RADIUS * 0.35 },
    { x: -SHIP_RADIUS * 1.1, y: 0 },
    { x: -SHIP_RADIUS * 0.4, y: -SHIP_RADIUS * 0.35 },
  ];
}

export function spawnShip(state: GameState, player: PlayerSlot): EntityId {
  const x = player === 1 ? SCREEN_W * 0.25 : SCREEN_W * 0.75;
  const y = SCREEN_H / 2;
  const angle = player === 1 ? -Math.PI / 2 : Math.PI / 2;
  const color = player === 1 ? SHIP1_COLOR : SHIP2_COLOR;
  const shipTag = player === 1 ? Ship1Tag : Ship2Tag;

  // Tangential orbital velocity (perpendicular to the star direction) so the
  // ships circle the star instead of falling straight into a head-on collision
  // at the centre. `v = sqrt(G/r)` is the circular-orbit speed for the
  // inverse-square field in `gravitySystem`.
  const toStarX = STAR_X - x;
  const toStarY = STAR_Y - y;
  const r = Math.hypot(toStarX, toStarY) || 1;
  const orbitSpeed = Math.sqrt(STAR_GRAVITY / r);
  const vx = (-toStarY / r) * orbitSpeed;
  const vy = (toStarX / r) * orbitSpeed;

  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx, vy });
  state.world.getStore(RotationDef).set(id, { angle });
  state.world.getStore(ShapeCircleDef).set(id, { radius: SHIP_RADIUS });
  state.world.getStore(RenderableDef).set(id, {
    closed: true,
    kind: 'polygon',
    lineWidth: 2,
    points: shipShape(SHIP_RADIUS),
    stroke: color,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 10 });
  state.world.getStore(CooldownDef).set(id, makeCooldown(FIRE_COOLDOWN_MS));
  state.world.getTag(shipTag).add(id);
  state.grid.add(id, x, y);

  // Thrust flame entity
  const flameId = state.world.createEntity();
  state.world.getStore(PositionDef).set(flameId, { x, y });
  state.world.getStore(RotationDef).set(flameId, { angle });
  state.world.getStore(RenderableDef).set(flameId, {
    closed: false,
    kind: 'polygon',
    lineWidth: 2,
    points: flameShape(),
    stroke: '#fa4',
  });
  state.world.getStore(RenderOrderDef).set(flameId, { value: 9 });
  state.world.getStore(OpacityDef).set(flameId, { value: 0 });
  state.world.getStore(AttachDef).set(flameId, { parent: id, snapPosition: true, snapRotation: true });
  state.world.getTag(ThrustFlameTag).add(flameId);

  return id;
}

export function spawnStar(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x: STAR_X, y: STAR_Y });
  state.world.getStore(ShapeCircleDef).set(id, { radius: STAR_RADIUS });
  state.world.getStore(RenderableDef).set(id, {
    fill: '#fe8',
    kind: 'circle',
    lineWidth: 2,
    radius: STAR_RADIUS,
    stroke: '#fc0',
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 5 });
  state.world.getTag(StarTag).add(id);
  state.grid.add(id, STAR_X, STAR_Y);
  return id;
}

export function spawnTorpedo(state: GameState, x: number, y: number, angle: number, shipVx: number, shipVy: number): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  // Inherit the firing ship's velocity: the muzzle velocity is relative to the
  // ship, so the torpedo always separates at TORPEDO_SPEED regardless of how
  // fast the ship is moving (with the muzzle offset, this prevents self-kills).
  state.world.getStore(VelocityDef).set(id, {
    vx: Math.cos(angle) * TORPEDO_SPEED + shipVx,
    vy: Math.sin(angle) * TORPEDO_SPEED + shipVy,
  });
  state.world.getStore(ShapeCircleDef).set(id, { radius: TORPEDO_RADIUS });
  state.world.getStore(LifetimeDef).set(id, makeLifetime(TORPEDO_LIFE_MS));
  state.world.getStore(RenderableDef).set(id, {
    fill: '#fe6',
    kind: 'circle',
    radius: TORPEDO_RADIUS,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 8 });
  state.world.getTag(TorpedoTag).add(id);
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

/**
 * Despawn a ship together with its attached thrust-flame. The flame is not
 * grid-indexed, so it is destroyed directly rather than through {@link despawn}
 * (which would call `grid.remove` for an entry that was never added).
 */
export function despawnShip(state: GameState, shipId: EntityId): void {
  const attachStore = state.world.getStore(AttachDef);
  for (const flameId of [...state.world.getTag(ThrustFlameTag)]) {
    const attach = attachStore.get(flameId);
    if (attach && attach.parent === shipId)
      state.world.queueDestroy(flameId);
  }
  despawn(state, shipId);
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.events.clear();
  state.grid.clear();

  state.scores = { 1: 0, 2: 0 };
  state.dead = false;
  state.winner = null;

  state.starId = spawnStar(state);
  state.shipIds[1] = spawnShip(state, 1);
  state.shipIds[2] = spawnShip(state, 2);
}
