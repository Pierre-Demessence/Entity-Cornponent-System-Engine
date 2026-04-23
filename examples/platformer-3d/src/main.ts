import type { GameState, Platformer3DEvent, PlatformerAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { Position3DDef } from './components';
import { CAMERA_MOUSE_SENSITIVITY, makeWorld, resetGame, RESPAWN_Y } from './game';
import { makeRenderer } from './render';
import {
  inputSystem,
  kinematics3dSystem,
  pickupSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;
const WIDTH = 800;
const HEIGHT = 600;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const renderer = makeRenderer(WIDTH, HEIGHT);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.margin = '0 auto';

  const hud = document.createElement('div');
  hud.style.cssText
    = 'display:flex;justify-content:space-between;padding:6px 12px;font:13px system-ui;color:#ccc;background:#12161b;';
  const score = document.createElement('span');
  score.textContent = 'Score: 0';
  const hint = document.createElement('span');
  hint.textContent = 'WASD move · Space jump · click to capture mouse, then move to rotate camera (Esc to release)';
  hud.append(score, hint);

  container.append(renderer.domElement, hud);

  const world = makeWorld();
  const events = new EventBus<Platformer3DEvent>();

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      Key.KeyW,
      Key.KeyA,
      Key.KeyS,
      Key.KeyD,
      Key.Space,
      Key.ArrowLeft,
      Key.ArrowRight,
      Key.ArrowUp,
      Key.ArrowDown,
    ],
  });
  const input = createInput<PlatformerAction>(
    {
      back: [Key.KeyS, Key.ArrowDown],
      forward: [Key.KeyW, Key.ArrowUp],
      jump: [Key.Space],
      left: [Key.KeyA, Key.ArrowLeft],
      right: [Key.KeyD, Key.ArrowRight],
    },
    [keyboard],
  );

  const state: GameState = {
    cameraYaw: 0,
    dtMs: LOGIC_TICK_MS,
    events,
    input,
    playerId: null,
    score: 0,
    world,
  };

  resetGame(state);

  // Pointer lock: clicking the canvas captures the cursor so the user
  // can spin the camera indefinitely without hitting the screen edge.
  // Pressing Esc (browser-handled) releases it.
  renderer.domElement.style.cursor = 'grab';
  const requestLock = (): void => {
    // Some browsers return a promise that rejects if the user denies
    // the gesture; swallow — there's nothing meaningful to do.
    void renderer.domElement.requestPointerLock?.();
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (document.pointerLockElement !== renderer.domElement)
      return;
    state.cameraYaw -= e.movementX * CAMERA_MOUSE_SENSITIVITY;
  };
  const onLockChange = (): void => {
    const locked = document.pointerLockElement === renderer.domElement;
    renderer.domElement.style.cursor = locked ? 'none' : 'grab';
  };
  renderer.domElement.addEventListener('click', requestLock);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerlockchange', onLockChange);

  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(kinematics3dSystem)
    .add(pickupSystem);

  const tickSource = new FixedIntervalTickSource(LOGIC_TICK_MS);
  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: tickSource,
    contextFactory: () => state,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    onTickComplete: () => input.clearEdges(),
    onBeforeFlush: () => {
      if (state.playerId != null) {
        const pos = world.getStore(Position3DDef).get(state.playerId);
        if (pos && pos.y < RESPAWN_Y) {
          events.emit({ type: 'PlayerFell' });
          resetGame(state);
        }
      }
    },
  });
  tickRunner.start();

  const refreshScore = (): void => {
    score.textContent = `Score: ${state.score}`;
  };
  const unsubCollected = events.on('CoinCollected', refreshScore);
  const unsubFell = events.on('PlayerFell', refreshScore);

  const renderTickSource = new AnimationFrameTickSource();
  const unsubRender = renderTickSource.subscribe(() => {
    renderer.render(state);
  });
  renderTickSource.start();

  return (): void => {
    renderer.domElement.removeEventListener('click', requestLock);
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerlockchange', onLockChange);
    if (document.pointerLockElement === renderer.domElement)
      document.exitPointerLock?.();
    unsubCollected();
    unsubFell();
    input.dispose();
    unsubRender();
    renderTickSource.stop();
    tickRunner.stop();
    renderer.dispose();
    container.innerHTML = '';
  };
}
