import type { GameState, MetaAction, ShipAction, SpacewarEvent } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { AssetLoader, audioBufferAsset } from '@pierre/ecs/modules/asset-loader';
import { makeAttachSystem } from '@pierre/ecs/modules/attach';
import { WebAudioProvider } from '@pierre/ecs/modules/audio';
import { makeCooldownSystem } from '@pierre/ecs/modules/cooldown';
import { createInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { makeParticleSystem } from '@pierre/ecs/modules/particles';
import { ContinuousHashGrid2D, makeGridSyncOnMove } from '@pierre/ecs/modules/spatial';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import fireSfxUrl from '../../assets/kenney_space-shooter-remastered/Bonus/sfx_laser1.ogg?url';
import gameOverSfxUrl from '../../assets/kenney_space-shooter-remastered/Bonus/sfx_lose.ogg?url';
import explodeSfxUrl from '../../assets/kenney_space-shooter-remastered/Bonus/sfx_zap.ogg?url';
import {
  CELL_SIZE,
  despawn,
  makeWorld,
  resetGame,
  SCREEN_H,
  SCREEN_W,
} from './game';
import { render } from './render';
import {
  collisionSystem,
  gravitySystem,
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
  hint.textContent = 'P1: A/D rotate · W thrust · S fire  |  P2: ← → rotate · ↑ thrust · ↓ fire  ·  R restart';
  container.append(canvas, hint);

  const ctx2d = canvas.getContext('2d')!;
  const world = makeWorld();
  const grid = new ContinuousHashGrid2D(CELL_SIZE);
  const events = new EventBus<SpacewarEvent>();

  // --- Audio: one-shot SFX via WebAudioProvider. Non-essential; fails soft if
  // the AudioContext is unavailable or clip decoding fails. ---
  const assetLoader = new AssetLoader();
  const audioAbort = new AbortController();
  const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioCtx: AudioContext | null = AudioCtor ? new AudioCtor() : null;
  let audioDisposed = false;
  let audio: WebAudioProvider | null = null;
  const playSfx = (id: string, volume: number): void => {
    if (!audio || audioCtx?.state !== 'running')
      return;
    try {
      audio.play(id, { channel: 'sfx', volume });
    }
    catch {
      // SFX is non-essential; ignore playback failures.
    }
  };
  if (audioCtx) {
    void (async () => {
      try {
        const [fire, gameOver, explode] = await Promise.all([
          assetLoader.load(audioBufferAsset(fireSfxUrl, audioCtx), { signal: audioAbort.signal }),
          assetLoader.load(audioBufferAsset(gameOverSfxUrl, audioCtx), { signal: audioAbort.signal }),
          assetLoader.load(audioBufferAsset(explodeSfxUrl, audioCtx), { signal: audioAbort.signal }),
        ]);
        if (!audioDisposed)
          audio = new WebAudioProvider({ clips: { explode, fire, gameOver }, context: audioCtx });
      }
      catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          console.warn('Spacewar audio: failed to load SFX.', error);
      }
    })();
  }
  const resumeAudio = (): void => {
    if (audioCtx?.state === 'suspended')
      void audioCtx.resume().catch(() => undefined);
  };
  window.addEventListener('keydown', resumeAudio);
  const unsubFired = events.on('TorpedoFired', () => playSfx('fire', 0.25));
  const unsubDestroyed = events.on('ShipDestroyed', () => playSfx('explode', 0.5));
  const unsubGameOver = events.on('GameOver', () => playSfx('gameOver', 0.6));

  const motionSystem = makeVelocityIntegrationSystem<GameState>({
    name: 'movement',
    boundary: { bounds: { height: SCREEN_H, width: SCREEN_W }, mode: 'wrap' },
    onMove: makeGridSyncOnMove({ cellSize: CELL_SIZE, grid: grid.grid }),
    runAfter: ['gravity'],
  });
  const lifetimeSystem = makeLifetimeSystem<GameState>({
    onExpire: despawn,
    runAfter: ['movement'],
  });
  const cooldownSystem = makeCooldownSystem<GameState>();
  const scheduler = new Scheduler<GameState>()
    .add(cooldownSystem)
    .add(inputSystem)
    .add(gravitySystem)
    .add(motionSystem)
    .add(makeParticleSystem<GameState>({ runAfter: ['movement'] }))
    .add(lifetimeSystem)
    .add(collisionSystem)
    .add(makeAttachSystem<GameState>({ runAfter: ['movement'] }))
    .add(thrustFlameSystem);
  const tickSource = new FixedIntervalTickSource(LOGIC_TICK_MS);

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [
      // Player 1
      Key.KeyA,
      Key.KeyD,
      Key.KeyW,
      Key.KeyS,
      // Player 2
      Key.ArrowLeft,
      Key.ArrowRight,
      Key.ArrowUp,
      Key.ArrowDown,
      // Meta
      Key.KeyR,
    ],
  });

  const player1Input = createInput<ShipAction>({
    fire: [Key.KeyS],
    rotateLeft: [Key.KeyA],
    rotateRight: [Key.KeyD],
    thrust: [Key.KeyW],
  }, [keyboard]);

  const player2Input = createInput<ShipAction>({
    fire: [Key.ArrowDown],
    rotateLeft: [Key.ArrowLeft],
    rotateRight: [Key.ArrowRight],
    thrust: [Key.ArrowUp],
  }, [keyboard]);

  const metaInput = createInput<MetaAction>({
    restart: [Key.KeyR],
  }, [keyboard]);

  const state: GameState = {
    dead: false,
    dtMs: LOGIC_TICK_MS,
    events,
    grid,
    inputs: { 1: player1Input, 2: player2Input },
    metaInput,
    scores: { 1: 0, 2: 0 },
    shipIds: { 1: null, 2: null },
    starId: null,
    winner: null,
    world,
  };

  resetGame(state);

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: tickSource,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    contextFactory: () => {
      if (state.metaInput.justPressed('restart'))
        resetGame(state);
      return state;
    },
    onTickComplete: () => {
      state.inputs[1].clearEdges();
      state.inputs[2].clearEdges();
      state.metaInput.clearEdges();
    },
  });
  tickRunner.start();

  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe(() => {
    render(ctx2d, state);
  });
  renderTickSource.start();

  return (): void => {
    audioDisposed = true;
    audioAbort.abort();
    window.removeEventListener('keydown', resumeAudio);
    unsubFired();
    unsubDestroyed();
    unsubGameOver();
    audio?.dispose();
    assetLoader.clear();
    if (audioCtx && audioCtx.state !== 'closed')
      void audioCtx.close().catch(() => undefined);
    state.inputs[1].dispose();
    state.inputs[2].dispose();
    state.metaInput.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    container.innerHTML = '';
  };
}
