import type { Facing, FroggerAction, GameState } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { makeParticleSystem } from '@pierre/ecs/modules/particles';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import {
  frogCenter,
  makePads,
  makeWorld,
  resetGame,
  SCREEN_H,
  SCREEN_W,
  START_ROW,
} from './game';
import { render } from './render';
import {
  collisionSystem,
  diveSystem,
  inputSystem,
  motionSystem,
  wrapSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const HIGH_SCORE_KEY = 'pierre-ecs-frogger-highscore';

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
  hint.textContent = '↑ ↓ ← → / W A S D to hop  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();

  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(motionSystem)
    .add(wrapSystem)
    .add(diveSystem)
    .add(collisionSystem)
    .add(makeParticleSystem<GameState>({ runAfter: ['motion'] }))
    .add(makeLifetimeSystem<GameState>({ runAfter: ['motion'] }));

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.ArrowUp, Key.ArrowDown, Key.ArrowLeft, Key.ArrowRight],
  });
  const input = createInput<FroggerAction>(
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
    best: loadBest(),
    dead: false,
    deathReason: '',
    deathTimerMs: 0,
    dtMs: LOGIC_TICK_MS,
    dying: false,
    events: new EventBus<never>(),
    facing: 'up',
    frogId: null,
    frogRow: START_ROW,
    furthestRow: START_ROW,
    input,
    level: 1,
    levelFlashMs: 0,
    lives: 3,
    pads: makePads(),
    pendingHop: null,
    score: 0,
    started: false,
    world,
  };

  resetGame(state);
  let savedBest = state.best;

  // Pointer/tap: hop one tile toward the dominant axis from the frog.
  const onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (state.dead) {
      resetGame(state);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const c = frogCenter(state);
    const dx = px - c.x;
    const dy = py - c.y;
    let dir: Facing;
    if (Math.abs(dx) > Math.abs(dy))
      dir = dx < 0 ? 'left' : 'right';
    else
      dir = dy < 0 ? 'up' : 'down';
    state.pendingHop = dir;
  };
  canvas.addEventListener('pointerdown', onPointerDown);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: new FixedIntervalTickSource(LOGIC_TICK_MS),
    contextFactory: () => state,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
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
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
