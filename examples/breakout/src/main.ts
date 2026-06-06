import type { BreakoutAction, GameState } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider, projectPointer } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { makeWorld, resetGame, SCREEN_H, SCREEN_W } from './game';
import { render } from './render';
import {
  brickCollisionSystem,
  launchSystem,
  motionSystem,
  outcomeSystem,
  paddleBounceSystem,
  paddleInputSystem,
  wallBounceSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const HIGH_SCORE_KEY = 'pierre-ecs-breakout-highscore';

function loadBest(): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    const value = raw == null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  catch {
    return 0;
  }
}

function saveBest(value: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  }
  catch {
    // Ignore storage failures (private mode, quota); the score just won't persist.
  }
}

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.cursor = 'pointer';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#9fb';
  hint.textContent = '← → / A D or mouse move  ·  Space / Click launch  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();

  const scheduler = new Scheduler<GameState>()
    .add(paddleInputSystem)
    .add(launchSystem)
    .add(motionSystem)
    .add(wallBounceSystem)
    .add(paddleBounceSystem)
    .add(brickCollisionSystem)
    .add(outcomeSystem);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.Space, Key.ArrowLeft, Key.ArrowRight, Key.KeyR],
  });
  const input = createInput<BreakoutAction>(
    {
      launch: [Key.Space, Key.ArrowUp],
      left: [Key.ArrowLeft, Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
    },
    [keyboard],
  );

  const state: GameState = {
    ballId: null,
    best: loadBest(),
    bricksLeft: 0,
    dead: false,
    dtMs: LOGIC_TICK_MS,
    events: new EventBus<never>(),
    input,
    launched: false,
    lives: 0,
    narrowed: false,
    paddleId: null,
    paddleW: 0,
    pointerLaunch: false,
    pointerX: null,
    score: 0,
    speed: 0,
    won: false,
    world,
  };

  resetGame(state);
  let savedBest = state.best;

  const pointerXFromEvent = (event: PointerEvent): number => projectPointer(event, canvas).x;

  const onPointerMove = (event: PointerEvent): void => {
    state.pointerX = pointerXFromEvent(event);
  };
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    state.pointerX = pointerXFromEvent(event);
    if (state.dead)
      resetGame(state);
    else
      state.pointerLaunch = true;
  };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: new FixedIntervalTickSource(LOGIC_TICK_MS),
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    contextFactory: () => {
      if (state.dead && input.justPressed('reset'))
        resetGame(state);
      return state;
    },
    onTickComplete: () => {
      if (state.best > savedBest) {
        savedBest = state.best;
        saveBest(savedBest);
      }
      input.clearEdges();
    },
  });
  tickRunner.start();

  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    render(ctx2d, state);
  });
  renderTickSource.start();

  return (): void => {
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
