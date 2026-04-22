import type { GameState, ShooterAction, ShooterEvent } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import {
  createInput,
  Key,
  KeyboardProvider,
  Pointer,
  PointerProvider,
} from '@pierre/ecs/modules/input';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { HashGrid2D, makeGridSyncOnMove } from '@pierre/ecs/modules/spatial';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import {
  CELL_SIZE,
  despawn,
  makeWorld,
  resetGame,
  SCREEN_H,
  SCREEN_W,
} from './game';
import { createFpsMeter, render } from './render';
import {
  enemySteerSystem,
  inputSystem,
  makeCollisionSystem,
  spawnerSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.background = '#000';
  canvas.style.cursor = 'crosshair';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = 'WASD move  ·  Mouse aim  ·  LMB / Space fire  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();
  const grid = new HashGrid2D();
  const events = new EventBus<ShooterEvent>();

  const motionSystem = makeVelocityIntegrationSystem<GameState>({
    name: 'movement',
    boundary: { bounds: { height: SCREEN_H, width: SCREEN_W }, mode: 'clamp' },
    onMove: makeGridSyncOnMove({ cellSize: CELL_SIZE, grid }),
  });
  const lifetimeSystem = makeLifetimeSystem<GameState>({
    onExpire: despawn,
    runAfter: ['movement'],
  });
  const collisionSystem = makeCollisionSystem();
  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(enemySteerSystem)
    .add(motionSystem)
    .add(lifetimeSystem)
    .add(collisionSystem)
    .add(spawnerSystem);

  const tickSource = new FixedIntervalTickSource(LOGIC_TICK_MS);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.ArrowLeft,
      Key.ArrowRight,
      Key.ArrowUp,
      Key.ArrowDown,
      Key.KeyA,
      Key.KeyD,
      Key.KeyW,
      Key.KeyS,
      Key.Space,
      Key.KeyR,
    ],
  });
  const pointer = new PointerProvider({
    initialPosition: { x: SCREEN_W / 2, y: SCREEN_H / 2 - 1 },
    target: canvas,
  });
  const input = createInput<ShooterAction>(
    {
      down: [Key.ArrowDown, Key.KeyS],
      fire: [Key.Space, Pointer.LeftButton],
      left: [Key.ArrowLeft, Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
      up: [Key.ArrowUp, Key.KeyW],
    },
    [keyboard, pointer],
  );

  const state: GameState = {
    dead: false,
    dtMs: LOGIC_TICK_MS,
    elapsedMs: 0,
    events,
    fireCooldownMs: 0,
    grid,
    input,
    playerId: null,
    pointer: pointer.state,
    score: 0,
    spawnTimerMs: 0,
    world,
  };

  resetGame(state);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: tickSource,
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

  const fpsMeter = createFpsMeter();
  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    render(ctx2d, state, fpsMeter);
  });
  renderTickSource.start();

  return (): void => {
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
