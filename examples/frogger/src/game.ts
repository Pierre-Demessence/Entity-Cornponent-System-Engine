import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';

import type { ObstacleKind } from './components';

import { EcsWorld } from '@pierre/ecs';

import {
  FrogTag,
  ObstacleDef,
  ObstacleTag,
  ParticleDef,
  ParticleTag,
  PositionDef,
  RenderableDef,
  RenderOrderDef,
  SizeDef,
  VelocityDef,
} from './components';

export const TILE = 48;
export const COLS = 15;
export const SCREEN_W = COLS * TILE; // 720
export const PLAYFIELD_ROWS = 13;
export const PLAYFIELD_H = PLAYFIELD_ROWS * TILE; // 624
export const HUD_H = 56;
export const SCREEN_H = PLAYFIELD_H + HUD_H; // 680

export const FROG = 34;
export const H_CAR = 30;
export const H_PLAT = 40;

export const START_ROW = 12;
export const GOAL_ROW = 0;
export const MEDIAN_ROW = 6;

export const PAD_COUNT = 5;
export const PAD_W = 56;

export const DEATH_MS = 850;
export const LEVEL_FLASH_MS = 1100;
export const START_LIVES = 3;

export const SCORE_FORWARD = 10;
export const SCORE_PAD = 50;
export const SCORE_LEVEL = 200;

export type Facing = 'down' | 'left' | 'right' | 'up';
export type LaneKind = 'goal' | 'road' | 'safe' | 'water';
export type FroggerAction = 'down' | 'left' | 'reset' | 'right' | 'up';

export interface Pad {
  cx: number;
  filled: boolean;
}

interface LaneSpec {
  count: number;
  crocs?: boolean;
  dir: -1 | 1;
  diving?: boolean;
  row: number;
  speed: number;
  type: ObstacleKind;
  width: number;
}

/**
 * Lanes from top (just below the goal bank) to bottom. Directions alternate
 * per lane; water lanes alternate logs and turtles, with crocodiles seeded
 * into some log lanes and divers into the turtle lanes.
 */
const LANES: LaneSpec[] = [
  { count: 3, crocs: true, dir: -1, row: 1, speed: 72, type: 'log', width: 144 },
  { count: 4, dir: 1, diving: true, row: 2, speed: 64, type: 'turtle', width: 96 },
  { count: 2, crocs: true, dir: -1, row: 3, speed: 96, type: 'log', width: 192 },
  { count: 3, dir: 1, diving: true, row: 4, speed: 56, type: 'turtle', width: 144 },
  { count: 3, dir: -1, row: 5, speed: 80, type: 'log', width: 144 },
  { count: 3, dir: 1, row: 7, speed: 84, type: 'car', width: 72 },
  { count: 3, dir: -1, row: 8, speed: 124, type: 'car', width: 48 },
  { count: 4, dir: 1, row: 9, speed: 104, type: 'car', width: 48 },
  { count: 2, dir: -1, row: 10, speed: 156, type: 'car', width: 96 },
  { count: 3, dir: 1, row: 11, speed: 92, type: 'car', width: 58 },
];

const CAR_COLORS = ['#ffd23f', '#ff7a5c', '#7ad7ff', '#c08bff', '#7CFC9B'];

export const TURTLE_FILL = '#3fae6b';
export const TURTLE_FILL_SUBMERGED = 'rgba(63,174,107,0.22)';

export interface GameState {
  best: number;
  dead: boolean;
  deathReason: string;
  deathTimerMs: number;
  dtMs: number;
  dying: boolean;
  events: EventBus<never>;
  facing: Facing;
  frogId: EntityId | null;
  frogRow: number;
  /** Lowest (closest-to-goal) row reached this life; drives forward scoring. */
  furthestRow: number;
  input: InputState<FroggerAction>;
  level: number;
  levelFlashMs: number;
  lives: number;
  pads: Pad[];
  /** Hop intent queued by a pointer tap; consumed next tick. */
  pendingHop: Facing | null;
  score: number;
  started: boolean;
  world: EcsWorld;
}

export function laneKindOf(row: number): LaneKind {
  if (row === GOAL_ROW)
    return 'goal';
  if (row >= 1 && row <= 5)
    return 'water';
  if (row >= 7 && row <= 11)
    return 'road';
  return 'safe';
}

/** Top-left Y for a frog sitting in `row`. */
export function rowFrogY(row: number): number {
  return row * TILE + (TILE - FROG) / 2;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(VelocityDef);
  w.registerComponent(SizeDef);
  w.registerComponent(ObstacleDef);
  w.registerComponent(ParticleDef);
  w.registerComponent(RenderableDef);
  w.registerComponent(RenderOrderDef);
  w.registerTag(FrogTag);
  w.registerTag(ObstacleTag);
  w.registerTag(ParticleTag);
  return w;
}

export function makePads(): Pad[] {
  return Array.from({ length: PAD_COUNT }, (_, i) => ({
    cx: ((i + 0.5) / PAD_COUNT) * SCREEN_W,
    filled: false,
  }));
}

function spawnFrog(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, {
    x: (SCREEN_W - FROG) / 2,
    y: rowFrogY(START_ROW),
  });
  state.world.getStore(SizeDef).set(id, { h: FROG, w: FROG });
  state.world.getTag(FrogTag).add(id);
  return id;
}

function obstacleFill(lane: LaneSpec, isCroc: boolean): string {
  if (lane.type === 'car')
    return CAR_COLORS[(lane.row - 7) % CAR_COLORS.length];
  if (isCroc)
    return '#2f7d4d';
  if (lane.type === 'turtle')
    return TURTLE_FILL;
  return '#9c6b3f';
}

function spawnObstacle(
  state: GameState,
  lane: LaneSpec,
  x: number,
  span: number,
  speedMul: number,
  isCroc: boolean,
  diving: boolean,
): void {
  const id = state.world.createEntity();
  const h = lane.type === 'car' ? H_CAR : H_PLAT;
  const kind: ObstacleKind = isCroc ? 'croc' : lane.type;
  state.world.getStore(PositionDef).set(id, {
    x,
    y: lane.row * TILE + (TILE - h) / 2,
  });
  state.world.getStore(VelocityDef).set(id, { vx: lane.dir * lane.speed * speedMul, vy: 0 });
  state.world.getStore(SizeDef).set(id, { h, w: lane.width });
  state.world.getStore(ObstacleDef).set(id, {
    diveTimerMs: 0,
    diving,
    kind,
    row: lane.row,
    span,
    submerged: false,
  });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'top-left',
    fill: obstacleFill(lane, isCroc),
    h,
    kind: 'rect',
    lineWidth: 2,
    stroke: 'rgba(0,0,0,0.3)',
    w: lane.width,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 10 });
  state.world.getTag(ObstacleTag).add(id);
}

export function clearObstacles(state: GameState): void {
  for (const id of [...state.world.getTag(ObstacleTag)])
    state.world.queueDestroy(id);
}

/** (Re)build every lane's traffic for the current level. */
export function spawnLanes(state: GameState): void {
  const speedMul = 1 + 0.12 * (state.level - 1);
  for (const lane of LANES) {
    const minGap = lane.type === 'car' ? 120 : 70;
    const span = Math.max(lane.count * (lane.width + minGap), SCREEN_W + lane.width + 80);
    const slot = span / lane.count;
    for (let i = 0; i < lane.count; i++) {
      const x = i * slot;
      const isCroc = lane.crocs === true && i === 0;
      const diving = lane.diving === true && i % 2 === 1;
      spawnObstacle(state, lane, x, span, speedMul, isCroc, diving);
    }
  }
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
  state.world.getStore(ParticleDef).set(id, { ageMs: 0, lifeMs });
  state.world.getStore(RenderableDef).set(id, {
    anchor: 'center',
    fill,
    h: size,
    kind: 'rect',
    w: size,
  });
  state.world.getStore(RenderOrderDef).set(id, { value: 28 });
  state.world.getTag(ParticleTag).add(id);
}

export function burst(
  state: GameState,
  x: number,
  y: number,
  count: number,
  colors: string[],
): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 50 + Math.random() * 200;
    spawnParticle(
      state,
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      350 + Math.random() * 320,
      colors[Math.floor(Math.random() * colors.length)],
      3 + Math.random() * 4,
    );
  }
}

export function frogCenter(state: GameState): { x: number; y: number } {
  const pos = state.world.getStore(PositionDef).get(state.frogId!)!;
  return { x: pos.x + FROG / 2, y: pos.y + FROG / 2 };
}

/** Move the frog to `row`, snapping its Y to the lane centre. */
export function setFrogRow(state: GameState, row: number): void {
  state.frogRow = row;
  state.world.getStore(PositionDef).get(state.frogId!)!.y = rowFrogY(row);
}

export function respawnFrog(state: GameState): void {
  const pos = state.world.getStore(PositionDef).get(state.frogId!)!;
  pos.x = (SCREEN_W - FROG) / 2;
  pos.y = rowFrogY(START_ROW);
  state.frogRow = START_ROW;
  state.furthestRow = START_ROW;
  state.facing = 'up';
  state.dying = false;
  state.deathTimerMs = 0;
  state.pendingHop = null;
}

export function killFrog(state: GameState, reason: string): void {
  if (state.dying || state.dead)
    return;
  state.dying = true;
  state.deathReason = reason;
  state.deathTimerMs = DEATH_MS;
  state.lives -= 1;
  const c = frogCenter(state);
  const water = reason === 'drown' || reason === 'eaten';
  burst(state, c.x, c.y, 16, water ? ['#9fd8ff', '#5ad1ff', '#eaf6ff'] : ['#ff5d5d', '#ffd23f', '#7CFC9B']);
}

function levelComplete(state: GameState): void {
  state.level += 1;
  state.score += SCORE_LEVEL;
  state.levelFlashMs = LEVEL_FLASH_MS;
  for (const pad of state.pads)
    pad.filled = false;
  clearObstacles(state);
  spawnLanes(state);
  respawnFrog(state);
}

/**
 * Resolve a hop into the goal row: fill an empty lillypad under the frog, or
 * kill it if it landed on the bank or a pad that is already full.
 */
export function handleGoalLanding(state: GameState): void {
  const cx = frogCenter(state).x;
  let idx = -1;
  for (let i = 0; i < state.pads.length; i++) {
    if (Math.abs(cx - state.pads[i].cx) <= PAD_W / 2) {
      idx = i;
      break;
    }
  }
  if (idx === -1 || state.pads[idx].filled) {
    killFrog(state, 'miss');
    return;
  }
  state.pads[idx].filled = true;
  state.score += SCORE_PAD;
  burst(state, state.pads[idx].cx, GOAL_ROW * TILE + TILE / 2, 14, ['#7CFC9B', '#ffd23f', '#eaf6ff']);
  if (state.pads.every(pad => pad.filled))
    levelComplete(state);
  else
    respawnFrog(state);
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.dead = false;
  state.dying = false;
  state.deathReason = '';
  state.deathTimerMs = 0;
  state.started = false;
  state.score = 0;
  state.lives = START_LIVES;
  state.level = 1;
  state.levelFlashMs = 0;
  state.facing = 'up';
  state.frogRow = START_ROW;
  state.furthestRow = START_ROW;
  state.pendingHop = null;
  state.pads = makePads();
  state.frogId = spawnFrog(state);
  spawnLanes(state);
}
