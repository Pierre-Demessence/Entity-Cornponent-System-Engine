import type { GameState, InvadersAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { makeCooldownSystem } from '@pierre/ecs/modules/cooldown';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { makeSpawner } from '@pierre/ecs/modules/spawner';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import {
  BOMB_INTERVAL_MS,
  makeWorld,
  MOTHERSHIP_MAX_MS,
  MOTHERSHIP_MIN_MS,
  resetGame,
  SCREEN_H,
  SCREEN_W,
} from './game';
import { render } from './render';
import {
  bombSystem,
  collisionSystem,
  fleetSystem,
  inputSystem,
  mothershipSystem,
  motionSystem,
  recycleSystem,
  waveSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const HIGH_SCORE_KEY = 'pierre-ecs-space-invaders-highscore';

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
  hint.textContent = '← → / A D move  ·  Space fire  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();

  const scheduler = new Scheduler<GameState>()
    .add(makeCooldownSystem<GameState>())
    .add(inputSystem)
    .add(fleetSystem)
    .add(bombSystem)
    .add(mothershipSystem)
    .add(motionSystem)
    .add(collisionSystem)
    .add(recycleSystem)
    .add(makeLifetimeSystem<GameState>({ runAfter: ['motion'] }))
    .add(waveSystem);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.Space, Key.ArrowLeft, Key.ArrowRight, Key.KeyR],
  });
  const input = createInput<InvadersAction>(
    {
      fire: [Key.Space, Key.ArrowUp],
      left: [Key.ArrowLeft, Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
    },
    [keyboard],
  );

  const state: GameState = {
    best: loadBest(),
    bombSpawner: makeSpawner(() => BOMB_INTERVAL_MS - Math.min(state.wave - 1, 5) * 80 + Math.random() * 400),
    dead: false,
    dtMs: LOGIC_TICK_MS,
    events: new EventBus<never>(),
    fleetDir: 1,
    fleetStepTimerMs: 0,
    input,
    lives: 3,
    mothershipSpawner: makeSpawner(() => MOTHERSHIP_MIN_MS + Math.random() * (MOTHERSHIP_MAX_MS - MOTHERSHIP_MIN_MS)),
    playerId: null,
    pointerDir: 0,
    pointerFire: false,
    score: 0,
    started: false,
    wave: 1,
    won: false,
    world,
  };

  resetGame(state);
  let savedBest = state.best;

  // Pointer control: steer toward the cursor's half of the canvas, fire on hold.
  const updatePointerDir = (event: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    state.pointerDir = x < SCREEN_W / 2 - 20 ? -1 : x > SCREEN_W / 2 + 20 ? 1 : 0;
  };
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (state.dead) {
      resetGame(state);
      return;
    }
    state.pointerFire = true;
    updatePointerDir(event);
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (state.pointerFire)
      updatePointerDir(event);
  };
  const onPointerUp = (): void => {
    state.pointerFire = false;
    state.pointerDir = 0;
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
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
    canvas.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
