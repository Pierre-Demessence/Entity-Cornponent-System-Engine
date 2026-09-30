import type { GameState } from './game';

import { EventBus } from '@pierre/ecs';
import { makeCameraRigSystem } from '@pierre/ecs/modules/camera-3d';
import { describe, expect, it } from 'vitest';

import { Block } from './blocks';
import { CameraTag, ChunkDef, GroundedDef, PlayerTag, Position3DDef } from './components';
import { updateView } from './frame';
import { CHUNK, CHUNKS, makeWorld, playerLook, resetGame, setBlock, spawnPoint } from './game';
import { movementSystem } from './systems';

function makeState(): GameState {
  const state = {
    cameraId: null,
    dtMs: 1000 / 60,
    events: new EventBus(),
    input: undefined,
    look: { locked: false },
    playerId: null,
    selected: 0,
    target: null,
    world: makeWorld(),
  } as unknown as GameState;
  resetGame(state);
  return state;
}

describe('resetGame', () => {
  it('spawns one chunk entity per chunk, a player and a camera', () => {
    const state = makeState();
    expect(state.world.chunkIds).toHaveLength(CHUNKS * CHUNKS);
    expect(state.world.getTag(PlayerTag).size).toBe(1);
    expect(state.world.getTag(CameraTag).size).toBe(1);
  });
});

describe('movementSystem', () => {
  it('drops the player onto the terrain and keeps them above it', () => {
    const state = makeState();
    const spawn = spawnPoint(state.world);
    for (let i = 0; i < 120; i++)
      movementSystem.run(state);
    const pos = state.world.getStore(Position3DDef).get(state.playerId!)!;
    expect(state.world.getStore(GroundedDef).get(state.playerId!)!.onGround).toBe(true);
    expect(pos.y).toBeGreaterThan(state.world.grid.surfaceY(Math.floor(pos.x), Math.floor(pos.z)));
    expect(pos.y).toBeLessThanOrEqual(spawn.y + 0.01);
  });
});

describe('setBlock', () => {
  it('remeshes the chunk holding the block and the neighbour across a border', () => {
    const state = makeState();
    const version = (cx: number, cz: number): number =>
      state.world.getStore(ChunkDef).get(state.world.chunkIds[cz * CHUNKS + cx]!)!.version;
    const before = [version(1, 1), version(0, 1), version(2, 1)];
    setBlock(state.world, CHUNK, 20, CHUNK + 4, Block.Stone); // west edge of chunk (1, 1)
    expect(version(1, 1)).toBe(before[0]! + 1);
    expect(version(0, 1)).toBe(before[1]! + 1);
    expect(version(2, 1)).toBe(before[2]);
    expect(state.world.grid.get(CHUNK, 20, CHUNK + 4)).toBe(Block.Stone);
  });
});

describe('updateView', () => {
  it('culls chunks behind the camera and picks the block underfoot when looking down', () => {
    const state = makeState();
    for (let i = 0; i < 120; i++)
      movementSystem.run(state);
    const rig = makeCameraRigSystem({ cameraTag: CameraTag, targetTag: PlayerTag });
    const look = playerLook(state)!;
    look.yaw = 0;
    look.pitch = 0;
    rig.run(state);
    const visibleAhead = updateView(state);
    expect(visibleAhead).toBeGreaterThan(0);
    expect(visibleAhead).toBeLessThan(CHUNKS * CHUNKS);

    look.pitch = -Math.PI / 2 + 0.05;
    rig.run(state);
    updateView(state);
    expect(state.target).not.toBeNull();
    expect(state.target!.place.y).toBeGreaterThan(state.target!.cell.y);
  });
});
