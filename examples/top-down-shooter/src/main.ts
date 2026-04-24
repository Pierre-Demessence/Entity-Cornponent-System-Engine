import type { GameState, ShooterAction, ShooterEvent } from './game';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import {
  AssetLoader,
  audioBufferAsset,
} from '@pierre/ecs/modules/asset-loader';
import {
  AudioQueue,
  makeAudioSystem,
  WebAudioProvider,
} from '@pierre/ecs/modules/audio';
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
  ensureMusicSource,
  makeWorld,
  resetGame,
  SCREEN_H,
  SCREEN_W,
  SHOOTER_AUDIO_CLIP_IDS,
} from './game';
import { createFpsMeter, render } from './render';
import {
  enemySteerSystem,
  inputSystem,
  makeCollisionSystem,
  spawnerSystem,
} from './systems';

const LOGIC_TICK_MS = 1000 / 60;

type ShooterClipId = (typeof SHOOTER_AUDIO_CLIP_IDS)[keyof typeof SHOOTER_AUDIO_CLIP_IDS];

const SHOOTER_CLIP_URLS: Record<ShooterClipId, string> = {
  [SHOOTER_AUDIO_CLIP_IDS.enemyKill]: new URL('./assets/audio/enemy-kill.wav', import.meta.url).toString(),
  [SHOOTER_AUDIO_CLIP_IDS.fire]: new URL('./assets/audio/fire.wav', import.meta.url).toString(),
  [SHOOTER_AUDIO_CLIP_IDS.musicMain]: new URL('./assets/audio/music.mp3', import.meta.url).toString(),
  [SHOOTER_AUDIO_CLIP_IDS.playerDown]: new URL('./assets/audio/player-down.wav', import.meta.url).toString(),
};

function createAudioContext(): AudioContext | null {
  const Ctor = (window.AudioContext ?? (window as unknown as {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext);
  if (!Ctor)
    return null;
  try {
    return new Ctor();
  }
  catch (error) {
    console.warn('TopDownShooter audio: failed to create AudioContext.', error);
    return null;
  }
}

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
  const clipUrls = SHOOTER_CLIP_URLS;
  const assetLoader = new AssetLoader();

  const audioQueue = new AudioQueue();
  const clipFailed = new Set<ShooterClipId>();
  const audioContext = createAudioContext();
  const clipHandles = audioContext
    ? {
        [SHOOTER_AUDIO_CLIP_IDS.enemyKill]: audioBufferAsset(clipUrls[SHOOTER_AUDIO_CLIP_IDS.enemyKill], audioContext),
        [SHOOTER_AUDIO_CLIP_IDS.fire]: audioBufferAsset(clipUrls[SHOOTER_AUDIO_CLIP_IDS.fire], audioContext),
        [SHOOTER_AUDIO_CLIP_IDS.musicMain]: audioBufferAsset(clipUrls[SHOOTER_AUDIO_CLIP_IDS.musicMain], audioContext),
        [SHOOTER_AUDIO_CLIP_IDS.playerDown]: audioBufferAsset(clipUrls[SHOOTER_AUDIO_CLIP_IDS.playerDown], audioContext),
      }
    : null;
  const clipLoads = new Map<ShooterClipId, Promise<void>>();
  const audioLoadAbort = new AbortController();
  let disposed = false;
  let stateRef: GameState | null = null;

  const isClipReady = (clipId: string): boolean => {
    if (!clipHandles)
      return false;
    const handle = clipHandles[clipId as ShooterClipId];
    return handle ? assetLoader.has(handle) : false;
  };

  const ensureClipLoaded = (clipId: ShooterClipId): void => {
    if (!audioContext || !clipHandles || disposed || clipFailed.has(clipId) || clipLoads.has(clipId))
      return;
    const handle = clipHandles[clipId];
    if (assetLoader.has(handle))
      return;

    const pending = assetLoader.load(handle, { signal: audioLoadAbort.signal })
      .then(() => {
        if (disposed)
          return;
        if (clipId === SHOOTER_AUDIO_CLIP_IDS.musicMain && stateRef)
          ensureMusicSource(stateRef);
      })
      .catch((error) => {
        if (disposed)
          return;
        if (error instanceof DOMException && error.name === 'AbortError')
          return;
        clipFailed.add(clipId);
        console.warn(`TopDownShooter audio: failed to load ${clipId} from ${clipUrls[clipId]}`, error);
      })
      .finally(() => {
        clipLoads.delete(clipId);
      });
    clipLoads.set(clipId, pending);
  };

  if (!audioContext) {
    console.warn('TopDownShooter audio: AudioContext unavailable, running without sound.');
  }

  const audioProvider = audioContext
    ? new WebAudioProvider({
        context: audioContext,
        resolveClip: (clipId) => {
          if (!clipHandles)
            return undefined;
          const handle = clipHandles[clipId as ShooterClipId];
          return handle ? assetLoader.get(handle) : undefined;
        },
      })
    : null;

  if (audioProvider) {
    audioProvider.setVolume('music', 0.55);
    audioProvider.setVolume('sfx', 0.9);
    for (const clipId of Object.keys(clipUrls) as ShooterClipId[]) {
      ensureClipLoaded(clipId);
    }
  }

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

  if (audioProvider) {
    scheduler.add(makeAudioSystem<GameState>({
      provider: audioProvider,
      queue: audioQueue,
      runAfter: ['collision'],
      onError: (error) => {
        const clipId = error.clipId as ShooterClipId | undefined;
        if (clipId && Object.hasOwn(clipUrls, clipId))
          ensureClipLoaded(clipId);
      },
    }));
  }

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
    audioEnabled: audioProvider !== null,
    audioQueue,
    dead: false,
    dtMs: LOGIC_TICK_MS,
    elapsedMs: 0,
    events,
    fireCooldownMs: 0,
    grid,
    input,
    isAudioClipReady: isClipReady,
    musicEntityId: null,
    playerId: null,
    pointer: pointer.state,
    score: 0,
    spawnTimerMs: 0,
    world,
    clearAudioQueue: () => {
      audioQueue.drain();
    },
  };

  stateRef = state;

  const unsubscribeEnemyKilled = events.on('EnemyKilled', () => {
    if (!state.audioEnabled || !state.isAudioClipReady(SHOOTER_AUDIO_CLIP_IDS.enemyKill))
      return;
    state.audioQueue.play(SHOOTER_AUDIO_CLIP_IDS.enemyKill, {
      channel: 'sfx',
      volume: 0.72,
    });
  });

  const unsubscribePlayerHit = events.on('PlayerHit', () => {
    if (!state.audioEnabled || !state.isAudioClipReady(SHOOTER_AUDIO_CLIP_IDS.playerDown))
      return;
    state.audioQueue.play(SHOOTER_AUDIO_CLIP_IDS.playerDown, {
      channel: 'sfx',
      volume: 0.9,
    });
  });

  resetGame(state);

  const resumeAudio = (): void => {
    if (!audioContext || audioContext.state === 'running')
      return;
    void audioContext.resume().catch(() => undefined);
  };

  canvas.addEventListener('pointerdown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);

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
    disposed = true;
    audioLoadAbort.abort();
    input.dispose();
    unsubscribeEnemyKilled();
    unsubscribePlayerHit();
    canvas.removeEventListener('pointerdown', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    audioProvider?.dispose();
    assetLoader.clear();
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => undefined);
    }
    container.innerHTML = '';
  };
}
