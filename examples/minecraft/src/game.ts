import type { EntityId, EventBus } from '@pierre/ecs';
import type { FirstPersonRig } from '@pierre/ecs/modules/camera-3d';
import type { InputState, MouseLookState } from '@pierre/ecs/modules/input';
import type { Vec3 } from '@pierre/ecs/modules/math';

import type { BlockId } from './blocks';
import type { VoxelHit } from './voxels';

import { EcsWorld } from '@pierre/ecs';
import { Camera3DDef, FirstPersonRigDef, makeCamera3D, makeFirstPersonRig } from '@pierre/ecs/modules/camera-3d';
import { degToRad } from '@pierre/ecs/modules/math';
import { Rotation3DDef } from '@pierre/ecs/modules/transform-3d';

import { Block, HOTBAR } from './blocks';
import {
  CameraTag,
  ChunkDef,
  ChunkTag,
  CooldownDef,
  GroundedDef,
  makeCooldown,
  PlayerTag,
  Position3DDef,
  ShapeAabb3DDef,
  Velocity3DDef,
} from './components';
import { VoxelGrid } from './voxels';
import { generateTerrain } from './worldgen';

// World layout: a square of CHUNKS × CHUNKS chunks, each CHUNK × HEIGHT × CHUNK blocks.
export const CHUNK = 16;
export const CHUNKS = 6;
export const HEIGHT = 48;
export const WORLD_SIZE = CHUNK * CHUNKS;
export const WORLD_SEED = 1337;

// Physics (1 world unit = 1 block ≈ 1 m).
export const GRAVITY = 30;
export const WALK_SPEED = 5;
export const SPRINT_SPEED = 8;
export const JUMP_IMPULSE = 9.5;
export const MAX_FALL_SPEED = 50;
export const AIR_CONTROL = 0.1;

// Player: a 0.6 × 1.8 × 0.6 box, camera 0.7 above its centre.
export const PLAYER_W = 0.6;
export const PLAYER_H = 1.8;
export const PLAYER_EYE = 0.7;
export const REACH = 6;
export const ACTION_COOLDOWN_MS = 220;
export const RESPAWN_Y = -10;

export const MOUSE_SENSITIVITY = 0.0022;
export const VIEW_W = 800;
export const VIEW_H = 640;

export type MinecraftAction = 'back' | 'break' | 'forward' | 'jump' | 'left' | 'place' | 'reset' | 'right' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'sprint';

export type MinecraftEvent = { type: 'BlockBroken'; block: number } | { type: 'BlockPlaced'; block: number };

/** The game's world: the ECS world plus the voxel grid the chunk entities describe. */
export class VoxelWorld extends EcsWorld {
  /** Chunk entity by `cz * CHUNKS + cx`. */
  readonly chunkIds: EntityId[] = [];
  readonly grid = new VoxelGrid(WORLD_SIZE, HEIGHT, WORLD_SIZE);

  constructor() {
    super();
    this.registerComponent(Position3DDef);
    this.registerComponent(Rotation3DDef);
    this.registerComponent(Velocity3DDef);
    this.registerComponent(ShapeAabb3DDef);
    this.registerComponent(GroundedDef);
    this.registerComponent(ChunkDef);
    this.registerComponent(CooldownDef);
    this.registerComponent(Camera3DDef);
    this.registerComponent(FirstPersonRigDef);
    this.registerTag(PlayerTag);
    this.registerTag(CameraTag);
    this.registerTag(ChunkTag);
  }
}

export interface GameState {
  cameraId: EntityId | null;
  dtMs: number;
  events: EventBus<MinecraftEvent>;
  input: InputState<MinecraftAction>;
  look: MouseLookState;
  playerId: EntityId | null;
  /** Hotbar slot in use. */
  selected: number;
  /** The block under the crosshair, refreshed every frame after the camera is posed. */
  target: VoxelHit | null;
  world: VoxelWorld;
}

export function makeWorld(): VoxelWorld {
  return new VoxelWorld();
}

export function playerLook(state: GameState): FirstPersonRig | undefined {
  return state.cameraId == null ? undefined : state.world.getStore(FirstPersonRigDef).get(state.cameraId);
}

export function selectedBlock(state: GameState): BlockId {
  return HOTBAR[state.selected] ?? Block.Grass;
}

/** The world point a fresh (or respawned) player starts from: above the terrain at the map centre. */
export function spawnPoint(world: VoxelWorld): Vec3 {
  const x = Math.floor(WORLD_SIZE / 2);
  return { x: x + 0.5, y: world.grid.surfaceY(x, x) + PLAYER_H / 2 + 0.05, z: x + 0.5 };
}

function spawnChunks(world: VoxelWorld): void {
  world.chunkIds.length = 0;
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const id = world.createEntity();
      world.getStore(ChunkDef).set(id, { cx, cz, version: 0, visible: 1 });
      world.getStore(Position3DDef).set(id, { x: cx * CHUNK + CHUNK / 2, y: HEIGHT / 2, z: cz * CHUNK + CHUNK / 2 });
      world.getStore(ShapeAabb3DDef).set(id, { d: CHUNK, h: HEIGHT, w: CHUNK });
      world.getTag(ChunkTag).add(id);
      world.chunkIds.push(id);
    }
  }
}

function spawnPlayer(state: GameState): EntityId {
  const world = state.world;
  const id = world.createEntity();
  world.getStore(Position3DDef).set(id, spawnPoint(world));
  world.getStore(Velocity3DDef).set(id, { vx: 0, vy: 0, vz: 0 });
  world.getStore(ShapeAabb3DDef).set(id, { d: PLAYER_W, h: PLAYER_H, w: PLAYER_W });
  world.getStore(GroundedDef).set(id, { onGround: false });
  world.getStore(CooldownDef).set(id, makeCooldown(0));
  world.getTag(PlayerTag).add(id);
  return id;
}

function spawnCamera(state: GameState): EntityId {
  const id = state.world.createEntity();
  state.world.getStore(Camera3DDef).set(id, makeCamera3D({
    far: 220,
    fovY: degToRad(70),
    near: 0.05,
    viewportH: VIEW_H,
    viewportW: VIEW_W,
  }));
  state.world.getStore(FirstPersonRigDef).set(id, makeFirstPersonRig({ eyeHeight: PLAYER_EYE }));
  state.world.getTag(CameraTag).add(id);
  return id;
}

/**
 * Change one block and mark the chunk holding it — plus the neighbour across
 * any border it sits on, whose faces it exposes or hides — for remeshing.
 */
export function setBlock(world: VoxelWorld, x: number, y: number, z: number, id: number): void {
  if (!world.grid.inBounds(x, y, z))
    return;
  world.grid.set(x, y, z, id);
  const cx = Math.floor(x / CHUNK);
  const cz = Math.floor(z / CHUNK);
  const lx = x - cx * CHUNK;
  const lz = z - cz * CHUNK;
  touchChunk(world, cx, cz);
  if (lx === 0)
    touchChunk(world, cx - 1, cz);
  if (lx === CHUNK - 1)
    touchChunk(world, cx + 1, cz);
  if (lz === 0)
    touchChunk(world, cx, cz - 1);
  if (lz === CHUNK - 1)
    touchChunk(world, cx, cz + 1);
}

function touchChunk(world: VoxelWorld, cx: number, cz: number): void {
  if (cx < 0 || cx >= CHUNKS || cz < 0 || cz >= CHUNKS)
    return;
  const chunk = world.getStore(ChunkDef).get(world.chunkIds[cz * CHUNKS + cx]!);
  if (chunk)
    chunk.version += 1;
}

/** Tear the world down and regenerate terrain, chunks, player and camera. */
export function resetGame(state: GameState): void {
  const world = state.world;
  world.clearAll();
  state.events.clear();
  world.grid.data.fill(0);
  generateTerrain(world.grid, WORLD_SEED);
  state.selected = 0;
  state.target = null;
  spawnChunks(world);
  state.playerId = spawnPlayer(state);
  state.cameraId = spawnCamera(state);
}
