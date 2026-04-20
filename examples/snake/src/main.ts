import type { GameState, SnakeEvent } from './game';

import { EventBus, Scheduler } from '@pierre/ecs';
import { ManualTickSource } from '@pierre/ecs/modules/tick';

import {
  CANVAS_PX,

  makeWorld,
  resetGame,

  spawnFood,
  TICK_MS,
} from './game';
import { render } from './render';
import { inputSystem, movementSystem } from './systems';

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_PX;
  canvas.height = CANVAS_PX;
  canvas.style.display = 'block';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.background = '#181818';
  const scoreEl = document.createElement('div');
  scoreEl.style.cssText = 'text-align:center;padding:8px;font:14px system-ui;color:#ccc';
  container.append(canvas, scoreEl);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();
  const events = new EventBus<SnakeEvent>();
  const scheduler = new Scheduler<GameState>().add(inputSystem).add(movementSystem);
  const tickSource = new ManualTickSource();

  const state: GameState = {
    dead: false,
    events,
    foodId: null,
    pendingDir: null,
    score: 0,
    segments: [],
    world,
  };

  resetGame(state);

  events.on('AppleEaten', () => {
    spawnFood(state);
  });
  events.on('GameOver', () => {
    state.dead = true;
  });

  const unsubscribeTick = tickSource.subscribe(() => {
    if (state.dead)
      return;
    scheduler.run(state);
    world.flushDestroys();
    world.lifecycle.flush();
    events.flush();
  });
  tickSource.start();

  const interval = window.setInterval(() => tickSource.tick(), TICK_MS);

  let rafId = 0;
  const loop = (): void => {
    render(ctx2d, state);
    scoreEl.textContent = `Score: ${state.score}`;
    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  const onKey = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        state.pendingDir = { dx: 0, dy: -1 };
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        state.pendingDir = { dx: 0, dy: 1 };
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        state.pendingDir = { dx: -1, dy: 0 };
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        state.pendingDir = { dx: 1, dy: 0 };
        break;
      case 'r':
      case 'R':
        if (state.dead)
          resetGame(state);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);

  return (): void => {
    window.removeEventListener('keydown', onKey);
    window.clearInterval(interval);
    window.cancelAnimationFrame(rafId);
    unsubscribeTick();
    tickSource.stop();
    container.innerHTML = '';
  };
}
