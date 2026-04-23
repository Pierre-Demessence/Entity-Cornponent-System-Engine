import type { Action, CardEvent, GameState } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Pointer, PointerProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, ManualTickSource } from '@pierre/ecs/modules/tick';

import { makeWorld, resetGame } from './game';
import { DomRenderer } from './render';
import { dragSystem, turnSystem } from './systems';

import './style.css';

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  // --- World + state ---------------------------------------------------
  const world = makeWorld();
  const events = new EventBus<CardEvent>();

  const pointer = new PointerProvider({ target: container });
  const input = createInput<Action>(
    {
      drag: [Pointer.LeftButton],
      reset: [],
    },
    [pointer],
  );

  const state: GameState = {
    drag: null,
    dtMs: 0,
    elapsedMs: 0,
    endTurnPending: false,
    enemyId: 0,
    energy: 0,
    energyMax: 0,
    events,
    input,
    phase: 'player',
    playerId: 0, // replaced by resetGame
    pointer: pointer.state,
    world,
  };
  resetGame(state);

  // --- Scheduler + logic tick -----------------------------------------
  const scheduler = new Scheduler<GameState>()
    .add(dragSystem)
    .add(turnSystem);

  const logicTick = new ManualTickSource();
  const runner = new TickRunner<GameState>({
    scheduler,
    source: logicTick,
    contextFactory: () => state,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    onTickComplete: () => input.clearEdges(),
  });
  runner.start();

  // --- Renderer (rAF) --------------------------------------------------
  const renderer = new DomRenderer();
  const renderTick = new AnimationFrameTickSource();
  const unsubscribeRender = renderTick.subscribe(() => {
    renderer.render({ root: container, state, world });
  });
  // Initial synchronous render so `bindButtons` finds the mounted DOM.
  renderer.render({ root: container, state, world });
  renderer.bindButtons({
    onEndTurn: () => {
      state.endTurnPending = true;
      logicTick.tick();
    },
    onReset: () => {
      resetGame(state);
      logicTick.tick();
    },
  });
  renderTick.start();

  // --- Pointer tick bridge --------------------------------------------
  // Both DOM handlers fire after PointerProvider's own handler (registered
  // first during construction), so `input.justPressed/justReleased` are
  // already set when we tick.
  const onPointerDown = (): void => {
    logicTick.tick();
  };
  const onPointerUp = (): void => {
    logicTick.tick();
  };
  container.addEventListener('pointerdown', onPointerDown);
  // Use window-level pointerup so release off-container still resolves
  // the drag (matches PointerProvider's own default `windowTarget`).
  window.addEventListener('pointerup', onPointerUp);

  return (): void => {
    container.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    input.dispose();
    unsubscribeRender();
    renderTick.stop();
    runner.stop();
    container.innerHTML = '';
  };
}
