import type { EntityId, EventBus } from '@pierre/ecs';

import { EcsWorld } from '@pierre/ecs';
import { pick } from '@pierre/ecs/modules/rng';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';

import {
  DirectionDef,
  FoodTag,
  PositionDef,
  SnakeHeadTag,
  SnakeSegmentTag,
} from './components';

export const GRID = 20;
export const CELL = 20;
export const CANVAS_PX = GRID * CELL;
export const TICK_MS = 125;
const START_LEN = 3;

export type SnakeEvent = { type: 'AppleEaten' } | { type: 'GameOver' };

export interface GameState {
  dead: boolean;
  events: EventBus<SnakeEvent>;
  foodId: EntityId | null;
  pendingDir: { dx: number; dy: number } | null;
  score: number;
  segments: EntityId[];
  world: SnakeWorld;
}

/** The snake's world, holding the typed handle on its board index. */
export class SnakeWorld extends EcsWorld {
  readonly grid: HashGrid2D;

  constructor() {
    super();
    this.registerComponent(PositionDef);
    this.registerComponent(DirectionDef);
    this.registerTag(SnakeHeadTag);
    this.registerTag(SnakeSegmentTag);
    this.registerTag(FoodTag);
    this.grid = this.enableSpatial(PositionDef, new HashGrid2D());
  }
}

export function makeWorld(): SnakeWorld {
  return new SnakeWorld();
}

export function spawnSegment(world: EcsWorld, x: number, y: number, isHead: boolean): EntityId {
  const id = world.createEntity();
  world.getStore(PositionDef).set(id, { x, y });
  world.getTag(SnakeSegmentTag).add(id);
  if (isHead) {
    world.getStore(DirectionDef).set(id, { dx: 1, dy: 0 });
    world.getTag(SnakeHeadTag).add(id);
  }
  return id;
}

function randomEmptyCell(world: SnakeWorld): { x: number; y: number } | null {
  const candidates: { x: number; y: number }[] = [];
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      if (!world.grid.getAt(x, y))
        candidates.push({ x, y });
    }
  }
  if (candidates.length === 0)
    return null;
  return pick(candidates) ?? null;
}

export function spawnFood(state: GameState): void {
  const cell = randomEmptyCell(state.world);
  if (!cell) {
    state.events.emit({ type: 'GameOver' });
    return;
  }
  const id = state.world.createEntity();
  state.world.getStore(PositionDef).set(id, cell);
  state.world.getTag(FoodTag).add(id);
  state.foodId = id;
}

export function resetGame(state: GameState): void {
  const { world } = state;
  world.clearAll();
  state.events.clear();

  state.segments = [];
  state.foodId = null;
  state.pendingDir = null;
  state.dead = false;
  state.score = 0;

  const startY = Math.floor(GRID / 2);
  for (let i = 0; i < START_LEN; i++) {
    state.segments.push(spawnSegment(world, 5 - i, startY, i === 0));
  }
  spawnFood(state);
}
