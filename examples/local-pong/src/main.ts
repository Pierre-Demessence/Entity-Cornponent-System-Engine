import type { InputState } from '@pierre/ecs/modules/input';

import type { GameState, LocalPongEvent, MetaAction, PongAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { Player } from './components';
import { LOGIC_TICK_MS, makeWorld, resetGame, SCREEN_H, SCREEN_W } from './game';
import { render } from './render';
import { collisionSystem, inputSystem, movementSystem, scoreSystem } from './systems';

function disposeInput(input: InputState<PongAction> | InputState<MetaAction>): void {
  input.dispose();
}

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const frame = document.createElement('div');
  frame.style.cssText = 'min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:18px;box-sizing:border-box;background:radial-gradient(circle at top, #16314e 0%, #081119 58%);';

  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.cssText = 'display:block;max-width:100%;height:auto;border:1px solid rgba(231,237,246,0.18);box-shadow:0 18px 46px rgba(0,0,0,0.35);';

  const hint = document.createElement('div');
  hint.style.cssText = 'font:600 13px Georgia, serif;color:#d5deea;text-align:center;letter-spacing:0.03em;';
  hint.textContent = 'Player 1: W / S  ·  Player 2: Arrow Up / Arrow Down  ·  R restart';

  const status = document.createElement('div');
  status.style.cssText = 'font:500 13px Georgia, serif;color:#97a9bd;text-align:center;min-height:1.4em;';

  frame.append(canvas, hint, status);
  container.append(frame);

  const ctx2d = canvas.getContext('2d');
  if (!ctx2d)
    throw new Error('Could not create 2D rendering context');

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.KeyW,
      Key.KeyS,
      Key.ArrowUp,
      Key.ArrowDown,
      Key.KeyR,
    ],
  });

  const player1Input = createInput<PongAction>({
    down: [Key.KeyS],
    up: [Key.KeyW],
  }, [keyboard]);

  const player2Input = createInput<PongAction>({
    down: [Key.ArrowDown],
    up: [Key.ArrowUp],
  }, [keyboard]);

  const metaInput = createInput<MetaAction>({
    restart: [Key.KeyR],
  }, [keyboard]);

  const state: GameState = {
    ballId: null,
    events: new EventBus<LocalPongEvent>(),
    metaInput,
    scores: { left: 0, right: 0 },
    serveToward: Player.Right,
    winner: null,
    world: makeWorld(),
    inputs: {
      [Player.Left]: player1Input,
      [Player.Right]: player2Input,
    },
    paddleIds: {
      [Player.Left]: null,
      [Player.Right]: null,
    },
  };

  const resetStatus = (): void => {
    status.textContent = 'First to 11. Each paddle is driven by its own input state.';
  };

  resetGame(state);
  resetStatus();

  const unsubscribeGoal = state.events.on('GoalScored', (event) => {
    const label = event.scorer === Player.Left ? 'Player 1' : 'Player 2';
    status.textContent = `${label} scored. ${event.scores.left} - ${event.scores.right}.`;
  });
  const unsubscribeMatch = state.events.on('MatchWon', (event) => {
    const label = event.winner === Player.Left ? 'Player 1' : 'Player 2';
    status.textContent = `${label} wins the match. Press R to restart.`;
  });

  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(movementSystem)
    .add(collisionSystem)
    .add(scoreSystem);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: new FixedIntervalTickSource(LOGIC_TICK_MS),
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    contextFactory: () => {
      if (state.metaInput.justPressed('restart')) {
        resetGame(state);
        resetStatus();
      }
      return state;
    },
    onTickComplete: () => {
      state.inputs.left.clearEdges();
      state.inputs.right.clearEdges();
      state.metaInput.clearEdges();
    },
  });
  tickRunner.start();

  const renderSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderSource.subscribe(() => {
    render(ctx2d, state);
  });
  renderSource.start();

  return (): void => {
    unsubscribeGoal();
    unsubscribeMatch();
    unsubscribeRender();
    renderSource.stop();
    tickRunner.stop();
    disposeInput(state.inputs.left);
    disposeInput(state.inputs.right);
    disposeInput(state.metaInput);
    container.innerHTML = '';
  };
}
