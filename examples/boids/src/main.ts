import type { GameState } from './game';

import { Scheduler, TickRunner } from '@pierre/ecs';
import { PointerProvider } from '@pierre/ecs/modules/input';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { ContinuousHashGrid2D, makeGridSyncOnMove } from '@pierre/ecs/modules/spatial';
import { FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import {
  CELL_SIZE,
  makeWorld,
  resetGame,
  SCREEN_H,
  SCREEN_W,
} from './game';
import { render } from './render';
import { flockSystem } from './systems';

const LOGIC_TICK_MS = 1000 / 60;

const NOOP_EVENTS = { flush: () => {} };

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.background = '#0b0f14';
  canvas.style.cursor = 'none';
  const caption = document.createElement('div');
  caption.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#9fb0c0';
  caption.textContent = 'Move the cursor to scatter the flock · boids graze the glowing food';
  container.append(canvas, caption);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();
  const grid = new ContinuousHashGrid2D(CELL_SIZE);
  const pointer = new PointerProvider({ target: canvas });

  const state: GameState = {
    dtMs: LOGIC_TICK_MS,
    elapsedMs: 0,
    grid,
    pointer: pointer.state,
    world,
  };

  resetGame(state);

  const motionSystem = makeVelocityIntegrationSystem<GameState>({
    name: 'motion',
    boundary: { bounds: { height: SCREEN_H, width: SCREEN_W }, mode: 'wrap' },
    onMove: makeGridSyncOnMove({ cellSize: CELL_SIZE, grid: grid.grid }),
    runAfter: ['flock'],
  });

  const scheduler = new Scheduler<GameState>().add(flockSystem).add(motionSystem);
  const tickSource = new FixedIntervalTickSource(LOGIC_TICK_MS);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: tickSource,
    getEvents: () => NOOP_EVENTS,
    getWorld: () => state.world,
    contextFactory: (info) => {
      state.dtMs = info.deltaMs ?? LOGIC_TICK_MS;
      state.elapsedMs += state.dtMs;
      return state;
    },
  });
  tickRunner.start();

  let rafId = 0;
  const loop = (): void => {
    render(ctx2d, state);
    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  return (): void => {
    window.cancelAnimationFrame(rafId);
    tickRunner.stop();
    pointer.dispose();
    container.innerHTML = '';
  };
}
