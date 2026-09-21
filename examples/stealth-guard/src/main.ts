import type { Action, GameState } from './game';

import { Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { makeWorld, resetGame, SCREEN_H, SCREEN_W } from './game';
import { render } from './render';
import {
  catchSystem,
  guardSystem,
  playerInputSystem,
  wallCollisionSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const NOOP_EVENTS = { flush: () => {} };

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.background = '#0c0e12';
  const caption = document.createElement('div');
  caption.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#9aa6b2';
  caption.textContent = 'WASD / arrows to sneak · stay out of the cones · R to reset — guard label shows its FSM state';
  container.append(canvas, caption);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.ArrowLeft,
      Key.ArrowRight,
      Key.ArrowUp,
      Key.ArrowDown,
      Key.KeyW,
      Key.KeyA,
      Key.KeyS,
      Key.KeyD,
      Key.KeyR,
    ],
  });
  const input = createInput<Action>(
    {
      down: [Key.ArrowDown, Key.KeyS],
      left: [Key.ArrowLeft, Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
      up: [Key.ArrowUp, Key.KeyW],
    },
    [keyboard],
  );

  const state: GameState = {
    activeGuard: null,
    caught: false,
    dtMs: LOGIC_TICK_MS,
    elapsedMs: 0,
    guards: [],
    input,
    playerId: 0 as GameState['playerId'],
    walls: [],
    world,
  };

  resetGame(state);

  const motionSystem = makeVelocityIntegrationSystem<GameState>({
    name: 'motion',
    boundary: { bounds: { height: SCREEN_H, width: SCREEN_W }, mode: 'clamp' },
    runAfter: ['guard'],
  });

  const scheduler = new Scheduler<GameState>()
    .add(playerInputSystem)
    .add(guardSystem)
    .add(motionSystem)
    .add(wallCollisionSystem)
    .add(catchSystem);

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
    onTickComplete: () => {
      if (state.input.justPressed('reset'))
        resetGame(state);
      input.clearEdges();
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
    input.dispose();
    container.innerHTML = '';
  };
}
