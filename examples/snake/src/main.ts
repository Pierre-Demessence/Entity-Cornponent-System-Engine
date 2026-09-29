import type { GameState, SnakeEvent } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createEventInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import {
  CANVAS_PX,

  makeWorld,
  resetGame,

  spawnFood,
  TICK_MS,
} from './game';
import { render } from './render';
import { inputSystem, movementSystem } from './systems';

type SnakeAction = 'down' | 'left' | 'reset' | 'right' | 'up';

const DIRECTIONS: Record<Exclude<SnakeAction, 'reset'>, { dx: number; dy: number }> = {
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: -1 },
};

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

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: tickSource,
    contextFactory: () => state,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
  });
  tickRunner.start();

  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    render(ctx2d, state);
    scoreEl.textContent = `Score: ${state.score}`;
  });
  renderTickSource.start();

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
  const input = createEventInput<SnakeAction>(
    {
      down: [Key.ArrowDown, Key.KeyS],
      left: [Key.ArrowLeft, Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
      up: [Key.ArrowUp, Key.KeyW],
    },
    [keyboard],
  );
  // The latest press wins until the next tick consumes it.
  const unsubscribeKeys = input.subscribe(({ action, kind }) => {
    if (kind !== 'down')
      return;
    if (action === 'reset') {
      if (state.dead)
        resetGame(state);
      return;
    }
    state.pendingDir = DIRECTIONS[action];
  });

  return (): void => {
    unsubscribeKeys();
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
