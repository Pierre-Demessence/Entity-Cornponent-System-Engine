import type { GameState, ShooterAction, ShooterEvent } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import {
  cellOf,
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
    onMove(ctx, id, prev, next) {
      const p = cellOf(prev.x, prev.y);
      const n = cellOf(next.x, next.y);
      if (p.x !== n.x || p.y !== n.y)
        ctx.grid.move(id, p, n);
    },
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
  const input = createInput<ShooterAction>(
    {
      down: [Key.ArrowDown, Key.KeyS],
      fire: [Key.Space],
      left: [Key.ArrowLeft, Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
      up: [Key.ArrowUp, Key.KeyW],
    },
    [keyboard],
  );

  const state: GameState = {
    aim: { x: SCREEN_W / 2, y: SCREEN_H / 2 - 1 },
    dead: false,
    dtMs: LOGIC_TICK_MS,
    elapsedMs: 0,
    events,
    fireCooldownMs: 0,
    fireHeld: false,
    grid,
    input,
    playerId: null,
    score: 0,
    spawnTimerMs: 0,
    world,
  };

  resetGame(state);

  // Mouse position + LMB hold state are maintained outside the input
  // module: `@pierre/ecs/modules/input` v1 handles discrete action
  // mappings only. The shooter's continuous aim vector and held-fire
  // flag live on `GameState` and are updated by DOM listeners. See
  // POSTMORTEM.md for the gap analysis.
  const onPointerMove = (ev: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    // Account for CSS scaling: canvas internal resolution vs displayed size.
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    state.aim.x = (ev.clientX - rect.left) * sx;
    state.aim.y = (ev.clientY - rect.top) * sy;
  };
  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.button === 0)
      state.fireHeld = true;
  };
  const onPointerUp = (ev: PointerEvent): void => {
    if (ev.button === 0)
      state.fireHeld = false;
  };
  const onContextMenu = (ev: MouseEvent): void => {
    ev.preventDefault();
  };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);

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
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('contextmenu', onContextMenu);
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
