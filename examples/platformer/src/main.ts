import type { GameState, PlatformerAction, PlatformerEvent } from './game';

import { EventBus, Scheduler } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { HashGrid2D } from '@pierre/ecs/modules/spatial';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { PositionDef } from './components';
import {

  makeWorld,

  resetGame,
  RESPAWN_Y,
  SCREEN_H,
  SCREEN_W,
} from './game';
import { render } from './render';
import {
  inputSystem,
  physicsSystem,
  pickupSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.display = 'block';
  canvas.style.background = '#111';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = '← → move  ·  Space / ↑ jump  ·  Fall off to respawn';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();
  const grid = new HashGrid2D();
  const events = new EventBus<PlatformerEvent>();
  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(physicsSystem)
    .add(pickupSystem);
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
    ],
  });
  const input = createInput<PlatformerAction>(
    {
      jump: [Key.Space, Key.ArrowUp, Key.KeyW],
      left: [Key.ArrowLeft, Key.KeyA],
      right: [Key.ArrowRight, Key.KeyD],
    },
    [keyboard],
  );

  const state: GameState = {
    dtMs: LOGIC_TICK_MS,
    events,
    grid,
    input,
    playerId: null,
    score: 0,
    world,
  };

  resetGame(state);

  const unsubscribeTick = tickSource.subscribe(() => {
    scheduler.run(state);
    // Respawn if player fell out of the world
    if (state.playerId != null) {
      const pos = world.getStore(PositionDef).get(state.playerId);
      if (pos && pos.y > RESPAWN_Y) {
        events.emit({ type: 'PlayerFell' });
        resetGame(state);
      }
    }
    world.endOfTick();
    events.flush();
    input.clearEdges();
  });
  tickSource.start();

  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    render(ctx2d, state);
  });
  renderTickSource.start();

  return (): void => {
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    unsubscribeTick();
    tickSource.stop();
    container.innerHTML = '';
  };
}
