import type { FlappyAction, GameState } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { makeWorld, resetGame, SCREEN_H, SCREEN_W } from './game';
import { render } from './render';
import {
  collisionSystem,
  flapSystem,
  gravitySystem,
  motionSystem,
  pipeRecycleSystem,
  pipeSpawnSystem,
  scoreSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.cursor = 'pointer';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#9fb';
  hint.textContent = 'Click / Space / ↑ flap  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();

  const scheduler = new Scheduler<GameState>()
    .add(flapSystem)
    .add(gravitySystem)
    .add(motionSystem)
    .add(pipeSpawnSystem)
    .add(scoreSystem)
    .add(pipeRecycleSystem)
    .add(collisionSystem);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.Space, Key.ArrowUp, Key.KeyR],
  });
  const input = createInput<FlappyAction>(
    {
      flap: [Key.Space, Key.ArrowUp],
      reset: [Key.KeyR],
    },
    [keyboard],
  );

  const state: GameState = {
    best: 0,
    birdId: null,
    dead: false,
    dtMs: LOGIC_TICK_MS,
    events: new EventBus<never>(),
    input,
    pointerFlap: false,
    score: 0,
    spawnTimerMs: 0,
    started: false,
    world,
  };

  resetGame(state);

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (state.dead)
      resetGame(state);
    else
      state.pointerFlap = true;
  };
  canvas.addEventListener('pointerdown', onPointerDown);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: new FixedIntervalTickSource(LOGIC_TICK_MS),
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    onTickComplete: () => input.clearEdges(),
    contextFactory: () => {
      if (state.dead && input.justPressed('reset'))
        resetGame(state);
      return state;
    },
  });
  tickRunner.start();

  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    render(ctx2d, state);
  });
  renderTickSource.start();

  return (): void => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
