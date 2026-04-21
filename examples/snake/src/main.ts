import type { GameState, SnakeEvent } from './game';

import { EventBus, Scheduler } from '@pierre/ecs';
import { Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

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
  const tickSource = new FixedIntervalTickSource(TICK_MS);

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
    world.endOfTick();
    events.flush();
  });
  tickSource.start();

  let rafId = 0;
  const loop = (): void => {
    render(ctx2d, state);
    scoreEl.textContent = `Score: ${state.score}`;
    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.ArrowUp,
      Key.ArrowDown,
      Key.ArrowLeft,
      Key.ArrowRight,
      Key.KeyW,
      Key.KeyS,
      Key.KeyA,
      Key.KeyD,
      Key.KeyR,
    ],
  });
  const unsubscribeKeys = keyboard.subscribe((raw) => {
    if (raw.kind !== 'down')
      return;
    switch (raw.code) {
      case Key.ArrowUp:
      case Key.KeyW:
        state.pendingDir = { dx: 0, dy: -1 };
        break;
      case Key.ArrowDown:
      case Key.KeyS:
        state.pendingDir = { dx: 0, dy: 1 };
        break;
      case Key.ArrowLeft:
      case Key.KeyA:
        state.pendingDir = { dx: -1, dy: 0 };
        break;
      case Key.ArrowRight:
      case Key.KeyD:
        state.pendingDir = { dx: 1, dy: 0 };
        break;
      case Key.KeyR:
        if (state.dead)
          resetGame(state);
        break;
      default:
        break;
    }
  });

  return (): void => {
    unsubscribeKeys();
    keyboard.dispose();
    window.cancelAnimationFrame(rafId);
    unsubscribeTick();
    tickSource.stop();
    container.innerHTML = '';
  };
}
