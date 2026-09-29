import type { Point, VisibilityGrid } from '@pierre/ecs/modules/grid-based';
import type { RandomFn } from '@pierre/ecs/modules/rng';

import { computeFieldOfView } from '@pierre/ecs/modules/grid-based';
import { fbm2D, simplex2D } from '@pierre/ecs/modules/noise';
import { makeSeededRng, randomInt, shuffle } from '@pierre/ecs/modules/rng';

import { TILE } from './defs';

export const MAP_W = 48;
export const MAP_H = 32;
export const FOV_RADIUS = 7;

const WALL = 0;
const FLOOR = 1;

// Tile indices in tiny-dungeon's packed sheet (12 columns).
const FLOOR_TILES = [48, 49, 42];
const WALL_FACE = 40; // brick face, for walls with floor just below
const WALL_TOP = [57, 58, 59];

export interface Room { h: number; w: number; x: number; y: number }

export interface Level {
  readonly depth: number;
  /** Cells seen at least once — the fog of war. */
  readonly explored: Uint8Array;
  readonly grid: Uint8Array;
  readonly rooms: readonly Room[];
  readonly seed: number;
  /** Cells in view this turn. */
  readonly visible: Uint8Array;
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

export function isFloor(level: Level, x: number, y: number): boolean {
  return inBounds(x, y) && level.grid[y * MAP_W + x] === FLOOR;
}

export function roomCenter(room: Room): Point {
  return { x: room.x + (room.w >> 1), y: room.y + (room.h >> 1) };
}

/**
 * Build a level. The same `(seed, depth)` always yields the same layout, which
 * is what lets a save store only the seed instead of the whole grid.
 */
export function generateLevel(seed: number, depth: number): Level {
  const rand = makeSeededRng(seed * 7919 + depth);
  const grid = new Uint8Array(MAP_W * MAP_H);
  const rooms: Room[] = [];

  for (let attempt = 0; attempt < 60 && rooms.length < 9; attempt++) {
    const w = 4 + randomInt(6, rand);
    const h = 4 + randomInt(4, rand);
    const room = { h, w, x: 1 + randomInt(MAP_W - w - 2, rand), y: 1 + randomInt(MAP_H - h - 2, rand) };
    if (rooms.some(r => overlaps(r, room)))
      continue;
    rooms.push(room);
    carve(grid, room.x, room.y, room.w, room.h);
  }

  // Connect rooms left to right so the corridors don't criss-cross too much.
  const ordered = [...rooms].sort((a, b) => a.x - b.x);
  for (let i = 1; i < ordered.length; i++)
    corridor(grid, roomCenter(ordered[i - 1]!), roomCenter(ordered[i]!), rand);

  // Erode walls that touch floor where the noise field is high, for ragged
  // cave-like edges. Only floor-adjacent cells, so nothing becomes unreachable.
  const noiseSeed = seed + depth * 101;
  const eroded: number[] = [];
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (grid[y * MAP_W + x] === WALL && touchesFloor(grid, x, y)
        && fbm2D(x, y, { frequency: 0.18, octaves: 3, seed: noiseSeed }) > 0.25) {
        eroded.push(y * MAP_W + x);
      }
    }
  }
  for (const i of eroded) grid[i] = FLOOR;

  // First room holds the player, last the stairs; shuffle the order so the
  // stairs are not always at the far right.
  shuffle(rooms, rand);

  return {
    depth,
    explored: new Uint8Array(MAP_W * MAP_H),
    grid,
    rooms,
    seed,
    visible: new Uint8Array(MAP_W * MAP_H),
  };
}

/** Recompute `visible` from the viewer and fold it into `explored`. */
export function updateFov(level: Level, x: number, y: number): void {
  const grid: VisibilityGrid = {
    isInBounds: inBounds,
    blocksSight: (cx, cy) => !isFloor(level, cx, cy),
  };
  level.visible.fill(0);
  for (const p of computeFieldOfView(grid, x, y, FOV_RADIUS)) {
    level.visible[p.y * MAP_W + p.x] = 1;
    level.explored[p.y * MAP_W + p.x] = 1;
  }
}

/** Paint the static map once; the frame loop blits the part the camera sees. */
export function bakeLevel(level: Level, sheet: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W * TILE;
  canvas.height = MAP_H * TILE;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      let tile: number;
      if (isFloor(level, x, y)) {
        const n = simplex2D(x * 0.3, y * 0.3, level.seed + level.depth);
        tile = FLOOR_TILES[n > 0.3 ? 1 : n < -0.55 ? 2 : 0]!;
      }
      else if (!touchesFloor(level.grid, x, y)) {
        continue; // solid rock — left black
      }
      else {
        tile = isFloor(level, x, y + 1) ? WALL_FACE : WALL_TOP[(x * 7 + y * 13) % WALL_TOP.length]!;
      }
      ctx.drawImage(sheet, (tile % 12) * TILE, Math.floor(tile / 12) * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
    }
  }
  return canvas;
}

function overlaps(a: Room, b: Room): boolean {
  return a.x - 1 < b.x + b.w && b.x - 1 < a.x + a.w && a.y - 1 < b.y + b.h && b.y - 1 < a.y + a.h;
}

function carve(grid: Uint8Array, x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++)
      grid[yy * MAP_W + xx] = FLOOR;
  }
}

function corridor(grid: Uint8Array, a: Point, b: Point, rand: RandomFn): void {
  const horizontalFirst = rand() < 0.5;
  const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  line(grid, a, corner);
  line(grid, corner, b);
}

function line(grid: Uint8Array, a: Point, b: Point): void {
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  let { x, y } = a;
  grid[y * MAP_W + x] = FLOOR;
  while (x !== b.x || y !== b.y) {
    x += dx;
    y += dy;
    grid[y * MAP_W + x] = FLOOR;
  }
}

function touchesFloor(grid: Uint8Array, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny) && grid[ny * MAP_W + nx] === FLOOR)
        return true;
    }
  }
  return false;
}
