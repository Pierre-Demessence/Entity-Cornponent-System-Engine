import type { GameState, PlatformerEvent } from './game';

import { EventBus, Scheduler } from '@pierre/ecs';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';
import { FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { PositionDef } from './components';
import {

  makeWorld,

  resetGame,
  RESPAWN_Y,
  SCREEN_H,
  SCREEN_W,
} from './game';
import { render } from './render';
import {
  inputSystem,
  physicsSystem,
  pickupSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.background = '#111';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = '← → move  ·  Space / ↑ jump  ·  Fall off to respawn';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();
  const grid = new HashGrid2D();
  const events = new EventBus<PlatformerEvent>();
  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(physicsSystem)
    .add(pickupSystem);
  const tickSource = new FixedIntervalTickSource(LOGIC_TICK_MS);

  const state: GameState = {
    dtMs: LOGIC_TICK_MS,
    events,
    grid,
    input: { jump: false, jumpPressed: false, left: false, right: false },
    playerId: null,
    score: 0,
    world,
  };

  resetGame(state);

  const unsubscribeTick = tickSource.subscribe(() => {
    scheduler.run(state);
    // Respawn if player fell out of the world
    if (state.playerId != null) {
      const pos = world.getStore(PositionDef).get(state.playerId);
      if (pos && pos.y > RESPAWN_Y) {
        events.emit({ type: 'PlayerFell' });
        resetGame(state);
      }
    }
    world.flushDestroys();
    world.lifecycle.flush();
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
        state.input.left = down;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        state.input.right = down;
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
      case ' ':
        if (down && !state.input.jump)
          state.input.jumpPressed = true;
        state.input.jump = down;
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
