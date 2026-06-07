import type { GameState, RiverRaidAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import {
  makeWorld,
  resetGame,
  SCREEN_H,
  SCREEN_W,
} from './game';
import { render } from './render';
import {
  collisionSystem,
  cooldownSystem,
  fuelSystem,
  inputSystem,
  motionSystem,
  scrollSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const HIGH_SCORE_KEY = 'pierre-ecs-river-raid-highscore';

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
    // Ignore storage failures.
  }
}

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.cursor = 'none';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#9fb';
  hint.textContent = '← → move  ·  ↑ accelerate  ·  ↓ brake  ·  Space fire  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();

  const scheduler = new Scheduler<GameState>()
    .add(cooldownSystem)
    .add(inputSystem)
    .add(scrollSystem)
    .add(motionSystem)
    .add(collisionSystem)
    .add(fuelSystem);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.ArrowUp,
      Key.ArrowDown,
      Key.ArrowLeft,
      Key.ArrowRight,
      Key.Space,
    ],
  });
  const input = createInput<RiverRaidAction>(
    {
      accelerate: [Key.ArrowUp, Key.KeyW],
      brake: [Key.ArrowDown, Key.KeyS],
      fire: [Key.Space],
      left: [Key.ArrowLeft, Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
    },
    [keyboard],
  );

  const state: GameState = {
    best: loadBest(),
    bridgeActive: false,
    deathTimerMs: 0,
    dtMs: LOGIC_TICK_MS,
    dying: false,
    events: new EventBus(),
    fuel: 100,
    gameOver: false,
    input,
    level: 1,
    levelProgress: 0,
    lives: 3,
    nextSpawnY: 0,
    playerId: null,
    score: 0,
    scrollOffset: 0,
    scrollSpeed: 120,
    segments: [],
    world,
  };

  resetGame(state);
  let savedBest = state.best;

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
    input.dispose();
    tickRunner.stop();
    unsubscribeRender();
  };
}
