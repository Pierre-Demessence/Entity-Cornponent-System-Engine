import type { SaveStorage } from '@pierre/ecs/modules/save';

import type { GameState, LanderAction } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { makeSpriteAnimationSystem } from '@pierre/ecs/modules/animation';
import { makeFollowCameraSystem } from '@pierre/ecs/modules/camera';
import { easeInCubic, easeOutQuart } from '@pierre/ecs/modules/easing';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { makeParticleSystem } from '@pierre/ecs/modules/particles';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { CameraTag, LanderDef, LanderTag, PositionDef } from './components';
import { makeWorld, newRun, startLevel, VIEW_H, VIEW_W } from './game';
import { render } from './render';
import { loadRuns, openStorage, recordRun } from './save';
import { contactSystem, exhaustSystem, gravitySystem, inputSystem, settleSystem } from './systems';
import { generateTerrain } from './terrain';

const LOGIC_TICK_MS = 1000 / 60;
const CAMERA_SMOOTHING = 5;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;
  canvas.style.display = 'block';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#9fb';
  hint.textContent = '↑/W/Space thrust  ·  ←/→ or A/D rotate  ·  Enter/R next level or new run';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const seed0 = Math.floor(Math.random() * 100000) + 1;

  const state: GameState = {
    cameraId: null,
    dtMs: LOGIC_TICK_MS,
    events: new EventBus<never>(),
    flameId: null,
    input: null as never,
    landerId: null,
    landings: 0,
    message: null,
    phase: 'flying',
    runRecorded: false,
    runs: [],
    score: 0,
    seed: seed0,
    terrain: generateTerrain(seed0),
    world: makeWorld(),
  };

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.ArrowLeft, Key.ArrowRight, Key.ArrowUp, Key.Space, Key.KeyA, Key.KeyD, Key.KeyW, Key.KeyR, Key.Enter],
  });
  const input = createInput<LanderAction>(
    {
      left: [Key.ArrowLeft, Key.KeyA],
      next: [Key.Enter, Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
      thrust: [Key.ArrowUp, Key.KeyW, Key.Space],
    },
    [keyboard],
  );
  state.input = input;
  newRun(state, seed0);

  const scheduler = new Scheduler<GameState>()
    .add(inputSystem)
    .add(gravitySystem)
    .add(makeVelocityIntegrationSystem<GameState>({ runAfter: ['gravity'] }))
    .add(contactSystem)
    .add(exhaustSystem)
    .add(settleSystem)
    .add(makeSpriteAnimationSystem<GameState>())
    .add(makeFollowCameraSystem<GameState>({
      cameraTag: CameraTag,
      positionDef: PositionDef,
      runAfter: ['motion'],
      smoothing: CAMERA_SMOOTHING,
      targetTag: LanderTag,
    }))
    .add(makeParticleSystem<GameState>({ fadeEasing: easeInCubic, runAfter: ['motion'], shrinkEasing: easeOutQuart }))
    .add(makeLifetimeSystem<GameState>({ runAfter: ['motion'] }));

  let storage: SaveStorage | null = null;
  openStorage()
    .then(async (s) => {
      storage = s;
      state.runs = await loadRuns(s);
    })
    .catch(() => { /* No storage: the leaderboard just stays empty. */ });

  function maybeRecordRun(): void {
    if (state.phase !== 'crashed' || state.runRecorded)
      return;
    state.runRecorded = true;
    if (state.score <= 0 || !storage)
      return;
    recordRun(storage, { at: Date.now(), landings: state.landings, score: state.score })
      .then((runs) => { state.runs = runs; })
      .catch(() => { /* A failed write must not stop the game. */ });
  }

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: new FixedIntervalTickSource(LOGIC_TICK_MS),
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    onTickComplete: () => input.clearEdges(),
    contextFactory: () => {
      maybeRecordRun();
      if (input.justPressed('next')) {
        if (state.phase === 'landed') {
          const fuel = state.world.getStore(LanderDef).get(state.landerId!)!.fuel;
          startLevel(state, state.seed + 1, fuel);
        }
        else if (state.phase === 'crashed') {
          newRun(state, state.seed + 1);
        }
        input.clearEdges();
      }
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
