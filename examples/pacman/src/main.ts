import type { GameState } from './game';

import { Scheduler, TickRunner } from '@pierre/ecs';
import { makeSpriteClipAnimationSystem } from '@pierre/ecs/modules/animation';
import { AudioQueue, makeAudioSystem, WebAudioProvider } from '@pierre/ecs/modules/audio';
import { createEventInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';
import { makeLifetimeSystem } from '@pierre/ecs/modules/lifetime';
import { makeVelocityIntegrationSystem } from '@pierre/ecs/modules/motion';
import { makeParticleSystem } from '@pierre/ecs/modules/particles';
import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';
import { LocalStorageBackend } from '@pierre/ecs/modules/save';
import { drawStatsOverlay, FrameStats } from '@pierre/ecs/modules/stats';
import { AnimationFrameTickSource, FixedIntervalTickSource } from '@pierre/ecs/modules/tick';

import { synthClips } from './audio';
import { WantDef } from './components';
import { makeAudioContext } from './context';
import { wireEvents } from './events';
import { HUD_TOP, makeState, newGame, SCREEN_H, SCREEN_W, TILE, VIEW } from './game';
import { DOWN, LEFT, RIGHT, UP } from './maze';
import { bakeMaze, mazeFlashing } from './render';
import { buildAtlas, buildClips } from './sprites';
import { RULE_SYSTEMS } from './systems';

type PacAction = 'down' | 'left' | 'reset' | 'right' | 'stats' | 'up';

const LOGIC_TICK_MS = 1000 / 60;
const BEST_KEY = 'pierre-ecs-pacman-best';

const TURNS = { down: DOWN, left: LEFT, right: RIGHT, up: UP } as const;

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  canvas.style.cssText = 'display:block;max-width:100%;height:auto;background:#000';
  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#9aa';
  hint.textContent = '↑ ↓ ← → / W A S D steer  ·  R restart after game over  ·  F frame stats';
  container.append(canvas, hint);
  const ctx2d = canvas.getContext('2d')!;

  const atlases = buildAtlas(document);
  const mazes = { blue: bakeMaze(document, '#2121ff'), white: bakeMaze(document, '#fff') };

  // Sound is synthesised, so it needs a context; browsers keep it suspended until the first key press.
  const audio = new AudioQueue();
  const audioContext = makeAudioContext();
  const provider = audioContext ? new WebAudioProvider({ clips: synthClips(audioContext), context: audioContext }) : null;

  const state: GameState = makeState(audio, 0, Math.random);
  const unwireEvents = wireEvents(state);

  // The high score lives in `modules/save`, which checksums it and keeps a backup.
  const storage = new LocalStorageBackend();
  let savedBest = 0;
  let closed = false;
  storage.load(BEST_KEY).then((raw) => {
    const best = raw === null ? 0 : Number.parseInt(raw, 10);
    if (!closed && Number.isFinite(best) && best > state.best) {
      state.best = best;
      savedBest = best;
    }
  }).catch(() => {});

  const scheduler = new Scheduler<GameState>();
  for (const system of RULE_SYSTEMS)
    scheduler.add(system);
  scheduler
    .add(makeSpriteClipAnimationSystem<GameState>({ registry: buildClips(), runAfter: ['anim'] }))
    .add(makeVelocityIntegrationSystem<GameState>({ name: 'motion' }))
    .add(makeParticleSystem<GameState>({ runAfter: ['motion'] }))
    .add(makeLifetimeSystem<GameState>({ runAfter: ['motion'] }));
  if (provider)
    scheduler.add(makeAudioSystem<GameState>({ provider, queue: audio }));

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.ArrowUp, Key.ArrowDown, Key.ArrowLeft, Key.ArrowRight, Key.Space],
  });
  const input = createEventInput<PacAction>(
    {
      down: [Key.ArrowDown, Key.KeyS],
      left: [Key.ArrowLeft, Key.KeyA],
      reset: [Key.KeyR],
      right: [Key.ArrowRight, Key.KeyD],
      stats: [Key.KeyF],
      up: [Key.ArrowUp, Key.KeyW],
    },
    [keyboard],
  );
  let showStats = false;
  const unsubscribeKeys = input.subscribe(({ action, kind }) => {
    if (kind !== 'down')
      return;
    void audioContext?.resume();
    if (action === 'reset') {
      if (state.phase.current === 'over')
        newGame(state);
    }
    else if (action === 'stats') {
      showStats = !showStats;
    }
    else {
      // Only the intended turn is stored; Pac-Man takes it at the first intersection that allows it.
      const want = state.world.getStore(WantDef).get(state.pacId);
      if (want) {
        want.dx = TURNS[action].dx;
        want.dy = TURNS[action].dy;
      }
    }
  });

  const tickRunner = new TickRunner<GameState>({
    scheduler,
    source: new FixedIntervalTickSource(LOGIC_TICK_MS),
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    contextFactory: (info) => {
      state.dtMs = info.deltaMs ?? LOGIC_TICK_MS;
      return state;
    },
    onTickComplete: () => {
      state.transitions.applyNext();
      if (state.best > savedBest && state.phase.current === 'over') {
        savedBest = state.best;
        storage.save(BEST_KEY, String(savedBest)).catch(() => {});
      }
    },
  });
  tickRunner.start();

  const renderer = new Canvas2DRenderer();
  const frameStats = new FrameStats();
  const renderTickSource = new AnimationFrameTickSource();
  const unsubscribeRender = renderTickSource.subscribe((info) => {
    frameStats.sample(info.deltaMs ?? 0);
    ctx2d.fillStyle = '#000';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.drawImage(mazeFlashing(state) ? mazes.white : mazes.blue, 0, HUD_TOP * TILE);
    renderer.render({ atlases, ctx2d, view: VIEW, world: state.world });
    if (showStats)
      drawStatsOverlay(ctx2d, frameStats, { x: 4, y: SCREEN_H - 60 });
  });
  renderTickSource.start();

  return (): void => {
    closed = true;
    unsubscribeKeys();
    input.dispose();
    unsubscribeRender();
    renderTickSource.stop();
    tickRunner.stop();
    unwireEvents();
    provider?.dispose();
    void audioContext?.close();
    container.innerHTML = '';
  };
}
