import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { Spawner } from '@pierre/ecs/modules/spawner';

import { EcsWorld } from '@pierre/ecs';
import { CooldownDef, makeCooldown } from '@pierre/ecs/modules/cooldown';
import { LifetimeDef, makeLifetime } from '@pierre/ecs/modules/lifetime';
import { resetSpawner } from '@pierre/ecs/modules/spawner';

import {
  AlienDef,
  AlienTag,
  BombTag,
  BunkerDef,
  BunkerTag,
  MothershipTag,
  PlayerTag,
  PositionDef,
  RenderableDef,
  RenderOrderDef,
  RocketTag,
  SizeDef,
  VelocityDef,
} from './components';

export const SCREEN_W = 720;
export const SCREEN_H = 680;

export const SIDE_MARGIN = 24;

export const PLAYER_W = 46;
export const PLAYER_H = 20;
export const PLAYER_Y = SCREEN_H - 56;
export const PLAYER_SPEED = 360;
export const INVULN_MS = 1300;

export const ROCKET_W = 4;
export const ROCKET_H = 16;
export const ROCKET_SPEED = 640;

export const BOMB_W = 5;
export const BOMB_H = 13;
export const BOMB_SPEED = 270;
export const BOMB_INTERVAL_MS = 850;

export const ALIEN_ROWS = 5;
export const ALIEN_COLS = 11;
export const ALIEN_W = 30;
export const ALIEN_H = 22;
export const ALIEN_GAP_X = 16;
export const ALIEN_GAP_Y = 14;
export const FLEET_TOP = 84;
export const FLEET_STEP_X = 12;
export const FLEET_STEP_DOWN = 22;
export const BEAT_MS_MAX = 620;
export const BEAT_MS_MIN = 90;

/** Y line the fleet must not cross — reaching it ends the game. */
export const INVASION_Y = PLAYER_Y - 6;

export const MOTHERSHIP_W = 52;
export const MOTHERSHIP_H = 20;
export const MOTHERSHIP_Y = 50;
export const MOTHERSHIP_SPEED = 150;
export const MOTHERSHIP_MIN_MS = 9000;
export const MOTHERSHIP_MAX_MS = 16000;

export const BUNKER_COUNT = 4;
export const BUNKER_Y = SCREEN_H - 150;
export const BRICK = 12;
export const BUNKER_BRICK_COLS = 6;
export const BUNKER_BRICK_ROWS = 4;

const ROW_POINTS = [30, 20, 20, 10, 10];
const ROW_COLORS = ['#ff5d8f', '#ffd23f', '#ffd23f', '#5ad1ff', '#5ad1ff'];

export type InvadersAction = 'fire' | 'left' | 'reset' | 'right';

export interface GameState {
  best: number;
  bombSpawner: Spawner;
  dead: boolean;
  dtMs: number;
  events: EventBus<never>;
  /** Fleet travel direction: 1 right, -1 left. */
  fleetDir: number;
  fleetStepTimerMs: number;
  input: InputState<InvadersAction>;
  lives: number;
  mothershipSpawner: Spawner;
  playerId: EntityId | null;
  /** Move intent via on-screen pointer drag (-1, 0, 1); OR-ed with keyboard. */
  pointerDir: number;
  pointerFire: boolean;
  score: number;
  started: boolean;
  wave: number;
  won: boolean;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(SizeDef);
  w.registerComponent(AlienDef);
  w.registerComponent(BunkerDef);
  w.registerComponent(CooldownDef);
  w.registerComponent(LifetimeDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerTag(PlayerTag);
  w.registerTag(AlienTag);
  w.registerTag(RocketTag);
  w.registerTag(BombTag);
  w.registerTag(MothershipTag);
  w.registerTag(BunkerTag);
  return w;
}

function spawnPlayer(state: GameState): EntityId {
  const id = state.world.createEntity();
  const x = (SCREEN_W - PLAYER_W) / 2;
  state.world.getStore(PositionDef).set(id, { x, y: PLAYER_Y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: 0 });
  state.world.getStore(SizeDef).set(id, { h: PLAYER_H, w: PLAYER_W });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: '#7CFC9B',
    h: PLAYER_H,
    kind: 'rect',
    lineWidth: 2,
    stroke: '#2f7d4d',
    w: PLAYER_W,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 30 });
  state.world.getStore(CooldownDef).set(id, makeCooldown(INVULN_MS));
  state.world.getTag(PlayerTag).add(id);
  return id;
}

/** Lay out the alien grid, nudged down a touch each wave. */
export function spawnFleet(state: GameState): void {
  const startTop = FLEET_TOP + Math.min(state.wave - 1, 4) * 20;
  const fleetW = ALIEN_COLS * ALIEN_W + (ALIEN_COLS - 1) * ALIEN_GAP_X;
  const startX = (SCREEN_W - fleetW) / 2;
  for (let row = 0; row < ALIEN_ROWS; row++) {
    for (let col = 0; col < ALIEN_COLS; col++) {
      const id = state.world.createEntity();
      const x = startX + col * (ALIEN_W + ALIEN_GAP_X);
      const y = startTop + row * (ALIEN_H + ALIEN_GAP_Y);
      state.world.getStore(PositionDef).set(id, { x, y });
      state.world.getStore(SizeDef).set(id, { h: ALIEN_H, w: ALIEN_W });
      state.world.getStore(RenderableDef).set(id, {
        anchor: 'top-left',
        fill: ROW_COLORS[row],
        h: ALIEN_H,
        kind: 'rect',
        lineWidth: 2,
        stroke: 'rgba(0,0,0,0.35)',
        w: ALIEN_W,
      });
      state.world.getStore(RenderOrderDef).set(id, { value: 20 });
      state.world.getStore(AlienDef).set(id, { col, points: ROW_POINTS[row], row });
      state.world.getTag(AlienTag).add(id);
    }
  }
}

function spawnBunkers(state: GameState): void {
  const bunkerW = BUNKER_BRICK_COLS * BRICK;
  const span = SCREEN_W / BUNKER_COUNT;
  for (let b = 0; b < BUNKER_COUNT; b++) {
    const baseX = span * b + (span - bunkerW) / 2;
    for (let row = 0; row < BUNKER_BRICK_ROWS; row++) {
      for (let col = 0; col < BUNKER_BRICK_COLS; col++) {
        // Carve a small archway in the lower-middle for the classic silhouette.
        const isArch = row >= BUNKER_BRICK_ROWS - 2
          && col >= BUNKER_BRICK_COLS / 2 - 1
          && col <= BUNKER_BRICK_COLS / 2;
        if (isArch)
          continue;
        const id = state.world.createEntity();
        state.world.getStore(PositionDef).set(id, {
          x: baseX + col * BRICK,
          y: BUNKER_Y + row * BRICK,
        });
        state.world.getStore(SizeDef).set(id, { h: BRICK, w: BRICK });
        state.world.getStore(BunkerDef).set(id, { hp: 3 });
        state.world.getStore(RenderableDef).set(id, {
          anchor: 'top-left',
          fill: '#3ddc6b',
          h: BRICK,
          kind: 'rect',
          w: BRICK,
        });
        state.world.getStore(RenderOrderDef).set(id, { value: 15 });
        state.world.getTag(BunkerTag).add(id);
      }
    }
  }
}

export function spawnRocket(state: GameState, x: number, y: number): void {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: -ROCKET_SPEED });
  state.world.getStore(SizeDef).set(id, { h: ROCKET_H, w: ROCKET_W });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: '#fdfd96',
    h: ROCKET_H,
    kind: 'rect',
    w: ROCKET_W,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 25 });
  state.world.getTag(RocketTag).add(id);
}

export function spawnBomb(state: GameState, x: number, y: number): void {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx: 0, vy: BOMB_SPEED });
  state.world.getStore(SizeDef).set(id, { h: BOMB_H, w: BOMB_W });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: '#ff9f1c',
    h: BOMB_H,
    kind: 'rect',
    w: BOMB_W,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 24 });
  state.world.getTag(BombTag).add(id);
}

export function spawnMothership(state: GameState): void {
  const id = state.world.createEntity();
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -MOTHERSHIP_W : SCREEN_W;
  state.world.getStore(PositionDef).set(id, { x, y: MOTHERSHIP_Y });
  state.world.getStore(VelocityDef).set(id, {
    vx: fromLeft ? MOTHERSHIP_SPEED : -MOTHERSHIP_SPEED,
    vy: 0,
  });
  state.world.getStore(SizeDef).set(id, { h: MOTHERSHIP_H, w: MOTHERSHIP_W });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: '#ff4d6d',
    h: MOTHERSHIP_H,
    kind: 'rect',
    lineWidth: 2,
    stroke: '#ffd23f',
    w: MOTHERSHIP_W,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 22 });
  state.world.getTag(MothershipTag).add(id);
}

export function spawnParticle(
  state: GameState,
  x: number,
  y: number,
  vx: number,
  vy: number,
  lifeMs: number,
  fill: string,
  size: number,
): void {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, { x, y });
  state.world.getStore(VelocityDef).set(id, { vx, vy });
  state.world.getStore(LifetimeDef).set(id, makeLifetime(lifeMs));
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'center',
    fill,
    h: size,
    kind: 'rect',
    w: size,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 28 });
}

export function explode(
  state: GameState,
  x: number,
  y: number,
  count: number,
  colors: string[],
): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 60 + Math.random() * 220;
    spawnParticle(
      state,
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      360 + Math.random() * 360,
      colors[Math.floor(Math.random() * colors.length)],
      3 + Math.random() * 4,
    );
  }
}

export function startWave(state: GameState): void {
  spawnFleet(state);
  state.fleetDir = 1;
  state.fleetStepTimerMs = beatInterval(state);
  resetSpawner(state.bombSpawner, BOMB_INTERVAL_MS);
}

export function beatInterval(state: GameState): number {
  const total = ALIEN_ROWS * ALIEN_COLS;
  const alive = [...state.world.getTag(AlienTag)].length || 1;
  const t = (total - alive) / total;
  const waveBoost = Math.min(state.wave - 1, 4) * 0.06;
  return Math.max(BEAT_MS_MIN, (BEAT_MS_MAX - (BEAT_MS_MAX - BEAT_MS_MIN) * t) * (1 - waveBoost));
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.dead = false;
  state.won = false;
  state.started = false;
  state.score = 0;
  state.lives = 3;
  state.wave = 1;
  state.fleetDir = 1;
  state.pointerDir = 0;
  state.pointerFire = false;
  resetSpawner(state.mothershipSpawner, MOTHERSHIP_MIN_MS);
  state.playerId = spawnPlayer(state);
  spawnBunkers(state);
  startWave(state);
}
