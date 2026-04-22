import type { AsteroidsAction, AsteroidsEvent, GameState } from './game';

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
import { render } from './render';
import {
  collisionSystem,
  inputSystem,
  thrustFlameSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.background = '#000';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = '← → rotate  ·  ↑ thrust  ·  Space fire  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();
  const grid = new HashGrid2D();
  const events = new EventBus<AsteroidsEvent>();
  const motionSystem = makeVelocityIntegrationSystem<GameState>({
    name: 'movement',
    boundary: { bounds: { height: SCREEN_H, width: SCREEN_W }, mode: 'wrap' },
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
  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(motionSystem)
    .add(lifetimeSystem)
    .add(collisionSystem)
    .add(thrustFlameSystem);
  const tickSource = new FixedIntervalTickSource(LOGIC_TICK_MS);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.ArrowLeft,
      Key.ArrowRight,
      Key.ArrowUp,
      Key.KeyA,
      Key.KeyD,
      Key.KeyW,
      Key.Space,
      Key.KeyR,
    ],
  });
  const input = createInput<AsteroidsAction>(
    {
      fire: [Key.Space],
      reset: [Key.KeyR],
      rotateLeft: [Key.ArrowLeft, Key.KeyA],
      rotateRight: [Key.ArrowRight, Key.KeyD],
      thrust: [Key.ArrowUp, Key.KeyW],
    },
    [keyboard],
  );

  const state: GameState = {
    dead: false,
    dtMs: LOGIC_TICK_MS,
    events,
    fireCooldownMs: 0,
    grid,
    input,
    score: 0,
    shipId: null,
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

  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    render(ctx2d, state);
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
