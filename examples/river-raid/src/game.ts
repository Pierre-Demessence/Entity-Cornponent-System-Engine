import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import { EcsWorld } from '@pierre/ecs';
import { CooldownDef, makeCooldown } from '@pierre/ecs/modules/cooldown';

import {
  BridgeDef,
  BridgeTag,
  BulletDef,
  BulletTag,
  EnemyDef,
  EnemyTag,
  FuelDepotDef,
  FuelDepotTag,
  PlayerTag,
  PositionDef,
  SizeDef,
  VelocityDef,
} from './components';

export const SCREEN_W = 480;
export const SCREEN_H = 720;

/** Player jet dimensions. */
export const JET_W = 36;
export const JET_H = 44;

/** Player fixed screen Y (near bottom). */
export const PLAYER_SCREEN_Y = 560;

/** Bullet size. */
export const BULLET_W = 4;
export const BULLET_H = 12;

/** Minimum river width (at bridges). */
export const MIN_RIVER_W = 64;

/** Maximum river width. */
export const MAX_RIVER_W = 280;

/** Scroll speed range (px/s). */
export const BASE_SCROLL_SPEED = 120;
export const MAX_SCROLL_SPEED = 320;
export const MIN_SCROLL_SPEED = 40;

/** Acceleration / braking rate (px/s²). */
export const SCROLL_ACCEL = 400;

/** Fuel settings. */
export const MAX_FUEL = 150;
export const FUEL_DRAIN_RATE = 4; // per second at base speed, scales with speed
export const FUEL_DEPOT_REFILL = 40;

/** Enemy sizes. */
export const BOAT_W = 36;
export const BOAT_H = 18;
export const HELI_W = 32;
export const HELI_H = 28;
export const ENEMY_JET_W = 40;
export const ENEMY_JET_H = 20;

/** Bridge dimensions. */
export const BRIDGE_W = 80;
export const BRIDGE_H = 20;
export const BRIDGE_HP = 3;

/** Fuel depot dimensions. */
export const DEPOT_W = 28;
export const DEPOT_H = 24;

/** Distance between levels (scroll pixels). */
export const LEVEL_DISTANCE = 3000;

/** Starting lives. */
export const START_LIVES = 3;

/** Death respawn delay (ms). */
export const DEATH_MS = 1200;

/** Shooting cooldown (ms). */
export const SHOOT_COOLDOWN_MS = 280;

export type RiverRaidAction = 'accelerate' | 'brake' | 'fire' | 'left' | 'reset' | 'right';

/** A river segment defines the left and right bank edges at a given world Y. */
export interface RiverSegment {
  /** Left edge of the river (x coordinate of rightmost bank pixel). */
  leftX: number;
  /** Right edge of the river (x coordinate of leftmost bank pixel). */
  rightX: number;
  /** World Y (top of this segment slice). */
  y: number;
}

export interface GameState {
  best: number;
  bridgeActive: boolean;
  deathTimerMs: number;
  dtMs: number;
  dying: boolean;
  events: EventBus<never>;
  fuel: number;
  gameOver: boolean;
  input: InputState<RiverRaidAction>;
  level: number;
  /** Distance scrolled in current level (toward bridge). */
  levelProgress: number;
  lives: number;
  /** Next world Y for segment generation (above the visible area). */
  nextSpawnY: number;
  playerId: EntityId | null;
  score: number;
  /** How many pixels the world has scrolled. screenY = SCREEN_H + scrollOffset - worldY. */
  scrollOffset: number;
  scrollSpeed: number;
  segments: RiverSegment[];
  world: EcsWorld;
}

/** Simple pseudo-random using a linear congruential generator (seeded). */
let _seed = 42;
function rand(): number {
  _seed = (_seed * 1664525 + 1013904223) | 0;
  return (_seed >>> 0) / 0xFFFFFFFF;
}

function randRange(min: number, max: number): number {
  return min + rand() * (max - min);
}

/** Reset the RNG seed (call at game start). */
export function resetRng(seed = 42): void {
  _seed = seed;
}

/** Smooth noise for river width variation. */
function riverWidth(t: number): number {
  const base = (MAX_RIVER_W + MIN_RIVER_W) / 2;
  const amp = (MAX_RIVER_W - MIN_RIVER_W) / 2;
  return base + amp * (
    Math.sin(t * 0.003) * 0.6
    + Math.sin(t * 0.007 + 1.2) * 0.25
    + Math.sin(t * 0.013 + 2.8) * 0.15
  );
}

/** River centre X varies gently. */
function riverCentreX(t: number): number {
  return SCREEN_W / 2 + Math.sin(t * 0.005 + 0.7) * 40 + Math.sin(t * 0.011) * 20;
}

/** Generate a river segment at world Y. */
function makeSegment(y: number): RiverSegment {
  const w = riverWidth(y);
  const cx = riverCentreX(y);
  return {
    leftX: Math.max(0, cx - w / 2),
    rightX: Math.min(SCREEN_W, cx + w / 2),
    y,
  };
}

/** Generate upcoming river segments ahead of the visible area. */
export function generateSegments(state: GameState): void {
  const step = 40; // segment slice height in world pixels
  const lookAhead = SCREEN_H + 600; // generate this far ahead of scroll offset
  const targetY = state.scrollOffset + lookAhead;
  if (state.nextSpawnY >= targetY)
    return;

  for (let y = state.nextSpawnY; y <= targetY; y += step) {
    const distInLevel = y % LEVEL_DISTANCE;
    const bridgeZone = LEVEL_DISTANCE - 200;
    let seg: RiverSegment;
    if (distInLevel >= bridgeZone) {
      const t = Math.min(1, (distInLevel - bridgeZone) / 200);
      const bridgeW = MIN_RIVER_W + (1 - t) * 20;
      seg = {
        leftX: (SCREEN_W - bridgeW) / 2,
        rightX: (SCREEN_W + bridgeW) / 2,
        y,
      };
    }
    else {
      seg = makeSegment(y);
    }
    state.segments.push(seg);
  }
  state.nextSpawnY = targetY + step;
}

/** Spawn a bridge entity at the given world Y. */
export function spawnBridge(state: GameState, worldY: number): void {
  const w = state.world;
  const cx = SCREEN_W / 2;
  const id = w.createEntity();
  w.getStore(PositionDef).set(id, { x: cx - BRIDGE_W / 2, y: worldY });
  w.getStore(SizeDef).set(id, { h: BRIDGE_H, w: BRIDGE_W });
  w.getStore(BridgeDef).set(id, { hp: BRIDGE_HP });
  w.getTag(BridgeTag).add(id);
}

/** Spawn a fuel depot at a random position on the river. */
export function spawnFuelDepot(state: GameState, worldY: number): void {
  const seg = state.segments.find(s => s.y <= worldY && s.y + 40 > worldY);
  if (!seg)
    return;
  const riverW = seg.rightX - seg.leftX;
  if (riverW < DEPOT_W + 20)
    return;
  const x = seg.leftX + randRange(10, riverW - DEPOT_W - 10);
  const w = state.world;
  const id = w.createEntity();
  w.getStore(PositionDef).set(id, { x, y: worldY });
  w.getStore(SizeDef).set(id, { h: DEPOT_H, w: DEPOT_W });
  w.getStore(FuelDepotDef).set(id, { fuel: FUEL_DEPOT_REFILL });
  w.getTag(FuelDepotTag).add(id);
}

/** Spawn an enemy at the given world Y. */
export function spawnEnemy(state: GameState, worldY: number, kind: 'boat' | 'helicopter' | 'jet'): void {
  const sizes: Record<string, { h: number; w: number }> = {
    boat: { h: BOAT_H, w: BOAT_W },
    helicopter: { h: HELI_H, w: HELI_W },
    jet: { h: ENEMY_JET_H, w: ENEMY_JET_W },
  };
  const pointsMap: Record<string, number> = { boat: 30, helicopter: 60, jet: 100 };
  const speedMap: Record<string, number> = { boat: 60, helicopter: 80, jet: 140 };
  const size = sizes[kind];
  const dir: -1 | 1 = rand() < 0.5 ? -1 : 1;
  const speed = speedMap[kind] + randRange(-20, 20);

  let x: number;
  if (kind === 'jet') {
    // Jets cross the entire screen
    x = dir === 1 ? -size.w - 10 : SCREEN_W + 10;
  }
  else {
    // Boats/helicopters stay within the river
    const seg = state.segments.find(s => s.y <= worldY && s.y + 40 > worldY);
    if (!seg)
      return;
    const riverW = seg.rightX - seg.leftX;
    x = seg.leftX + randRange(0, Math.max(0, riverW - size.w));
  }

  const w = state.world;
  const id = w.createEntity();
  w.getStore(PositionDef).set(id, { x, y: worldY });
  w.getStore(VelocityDef).set(id, { vx: dir * speed, vy: 0 });
  w.getStore(SizeDef).set(id, size);
  w.getStore(EnemyDef).set(id, {
    dir,
    kind,
    points: pointsMap[kind],
    speed,
  });
  w.getTag(EnemyTag).add(id);
}

/** Spawn a player bullet. */
export function spawnBullet(state: GameState): void {
  if (state.playerId == null)
    return;
  const pos = state.world.getStore(PositionDef).get(state.playerId);
  if (!pos)
    return;
  const w = state.world;
  const id = w.createEntity();
  w.getStore(PositionDef).set(id, {
    x: pos.x + JET_W / 2 - BULLET_W / 2,
    y: pos.y - BULLET_H,
  });
  w.getStore(VelocityDef).set(id, { vx: 0, vy: 400 }); // positive = up on screen with new formula
  w.getStore(SizeDef).set(id, { h: BULLET_H, w: BULLET_W });
  w.getStore(BulletDef).set(id, { damage: 1 });
  w.getTag(BulletTag).add(id);
}

/** Create a fresh ECS world with all components and tags registered. */
export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(SizeDef);
  w.registerComponent(EnemyDef);
  w.registerComponent(BridgeDef);
  w.registerComponent(FuelDepotDef);
  w.registerComponent(BulletDef);
  w.registerComponent(CooldownDef);
  w.registerTag(PlayerTag);
  w.registerTag(BulletTag);
  w.registerTag(EnemyTag);
  w.registerTag(FuelDepotTag);
  w.registerTag(BridgeTag);
  return w;
}

/** Spawn the player jet. */
export function spawnPlayer(state: GameState): EntityId {
  const w = state.world;
  // Remove old player if any
  if (state.playerId != null && w.getStore(PositionDef).has(state.playerId)) {
    w.destroyEntity(state.playerId);
  }
  const id = w.createEntity();
  // player worldY such that screenY = SCREEN_H + scrollOffset - worldY = PLAYER_SCREEN_Y
  w.getStore(PositionDef).set(id, {
    x: (SCREEN_W - JET_W) / 2,
    y: state.scrollOffset + SCREEN_H - PLAYER_SCREEN_Y,
  });
  w.getStore(SizeDef).set(id, { h: JET_H, w: JET_W });
  w.getStore(CooldownDef).set(id, makeCooldown(SHOOT_COOLDOWN_MS));
  w.getTag(PlayerTag).add(id);
  state.playerId = id;
  return id;
}

/** Reset game state for a new game. */
export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.segments = [];
  state.scrollOffset = 0;
  state.nextSpawnY = 0;
  state.scrollSpeed = BASE_SCROLL_SPEED;
  state.fuel = MAX_FUEL;
  state.score = 0;
  state.lives = START_LIVES;
  state.level = 1;
  state.levelProgress = 0;
  state.gameOver = false;
  state.dying = false;
  state.deathTimerMs = 0;
  state.bridgeActive = false;
  state.best = Math.max(state.best, state.score);
  resetRng();
  spawnPlayer(state);
}

/** Respawn player after death. */
export function respawnPlayer(state: GameState): void {
  state.dying = false;
  state.deathTimerMs = 0;
  state.playerId = null;
  if (state.lives <= 0) {
    state.gameOver = true;
    state.best = Math.max(state.best, state.score);
    return;
  }
  spawnPlayer(state);
}
