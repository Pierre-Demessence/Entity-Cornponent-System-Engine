import type { AsteroidsEvent, GameState } from './game';

import { EventBus, Scheduler } from '@pierre/ecs';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';
import { FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import {

  makeWorld,
  resetGame,
  SCREEN_H,
  SCREEN_W,
} from './game';
import { render } from './render';
import {
  collisionSystem,
  inputSystem,
  lifetimeSystem,
  movementSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.background = '#000';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = '← → rotate  ·  ↑ thrust  ·  Space fire  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();
  const grid = new HashGrid2D();
  const events = new EventBus<AsteroidsEvent>();
  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(movementSystem)
    .add(lifetimeSystem)
    .add(collisionSystem);
  const tickSource = new FixedIntervalTickSource(LOGIC_TICK_MS);

  const state: GameState = {
    dead: false,
    dtMs: LOGIC_TICK_MS,
    events,
    fireCooldownMs: 0,
    grid,
    input: { fire: false, rotateLeft: false, rotateRight: false, thrust: false },
    score: 0,
    shipId: null,
    world,
  };

  resetGame(state);

  const unsubscribeTick = tickSource.subscribe(() => {
    scheduler.run(state);
    world.endOfTick();
    events.flush();
  });
  tickSource.start();

  let rafId = 0;
  const loop = (): void => {
    render(ctx2d, state);
    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  const setKey = (e: KeyboardEvent, down: boolean): void => {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        state.input.rotateLeft = down;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        state.input.rotateRight = down;
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        state.input.thrust = down;
        break;
      case ' ':
        state.input.fire = down;
        break;
      case 'r':
      case 'R':
        if (down && state.dead)
          resetGame(state);
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  const onDown = (e: KeyboardEvent): void => setKey(e, true);
  const onUp = (e: KeyboardEvent): void => setKey(e, false);
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);

  return (): void => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.cancelAnimationFrame(rafId);
    unsubscribeTick();
    tickSource.stop();
    container.innerHTML = '';
  };
}
