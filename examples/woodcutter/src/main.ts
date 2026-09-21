import type { GameState } from './game';

import { Scheduler, TickRunner } from '@pierre/ecs';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { makeWorld, resetGame, SCREEN_H, SCREEN_W } from './game';
import { render } from './render';
import { workerSystem } from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const NOOP_EVENTS = { flush: () => {} };

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.background = '#0e0b08';
  const caption = document.createElement('div');
  caption.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#a8977f';
  caption.textContent = 'GOAP: each worker plans get-axe → chop → deliver. After the first log it keeps the axe, so the planner drops GetAxe.';
  container.append(canvas, caption);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();

  const state: GameState = {
    activeWorker: null,
    dtMs: LOGIC_TICK_MS,
    elapsedMs: 0,
    treeOccupant: [],
    workers: [],
    world,
  };

  resetGame(state);

  const motionSystem = makeVelocityIntegrationSystem<GameState>({
    name: 'motion',
    boundary: { bounds: { height: SCREEN_H, width: SCREEN_W }, mode: 'clamp' },
    runAfter: ['worker'],
  });

  const scheduler = new Scheduler<GameState>().add(workerSystem).add(motionSystem);
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
    container.innerHTML = '';
  };
}
