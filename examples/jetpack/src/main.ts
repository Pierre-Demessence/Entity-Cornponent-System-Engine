import type { GameState, JetpackAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { makeWorld, resetGame, SCREEN_H, SCREEN_W } from './game';
import { render } from './render';
import {
  bulletSystem,
  collisionSystem,
  motionSystem,
  particleSystem,
  playerBoundsSystem,
  recycleSystem,
  scoreSystem,
  scrollSystem,
  spawnSystem,
  thrustSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const HIGH_SCORE_KEY = 'pierre-ecs-jetpack-highscore';

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
  hint.textContent = 'Hold Space / ↑ / mouse to fly  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();

  const scheduler = new Scheduler<GameState>()
    .add(thrustSystem)
    .add(scrollSystem)
    .add(spawnSystem)
    .add(bulletSystem)
    .add(motionSystem)
    .add(playerBoundsSystem)
    .add(recycleSystem)
    .add(particleSystem)
    .add(collisionSystem)
    .add(scoreSystem);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.Space, Key.ArrowUp, Key.KeyR],
  });
  const input = createInput<JetpackAction>(
    {
      reset: [Key.KeyR],
      thrust: [Key.Space, Key.ArrowUp],
    },
    [keyboard],
  );

  const state: GameState = {
    best: loadBest(),
    bulletTimerMs: 0,
    dead: false,
    distance: 0,
    dtMs: LOGIC_TICK_MS,
    events: new EventBus<never>(),
    input,
    playerId: null,
    pointerThrust: false,
    score: 0,
    scrollSpeed: 0,
    spawnTimerMs: 0,
    started: false,
    thrusting: false,
    world,
  };

  resetGame(state);
  let savedBest = state.best;

  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (state.dead)
      resetGame(state);
    else
      state.pointerThrust = true;
  };
  const onPointerUp = (): void => {
    state.pointerThrust = false;
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);

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
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
