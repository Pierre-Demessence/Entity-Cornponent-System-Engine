import type { GameState, Lane, RhythmEvent } from './game';
import type { RenderFeedback } from './render';

import { EventBus, Scheduler, TickRunner } from '@pierre/ecs';
import { createEventInput, Key, KeyboardProvider } from '@pierre/ecs/modules/input';

import { AudioClockTickSource, AudioEngine } from './audio';
import { makeWorld, resetGame } from './game';
import { CANVAS_H, CANVAS_W, render } from './render';
import { cullSystem, inputSystem, spawnSystem } from './systems';

type RhythmAction = 'lane0' | 'lane1' | 'lane2' | 'lane3' | 'reset';

const LANE_OF: Record<Exclude<RhythmAction, 'reset'>, Lane> = { lane0: 0, lane1: 1, lane2: 2, lane3: 3 };

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.background = '#0a0a12';

  const hint = document.createElement('div');
  hint.style.cssText = 'text-align:center;padding:8px;font:13px system-ui;color:#888';
  hint.textContent = 'Click to start  ·  D F J K to hit notes  ·  R to reset';

  container.append(canvas, hint);
  const ctx2d = canvas.getContext('2d')!;

  const audio = new AudioEngine();
  const world = makeWorld();
  const events = new EventBus<RhythmEvent>();

  const state: GameState = {
    audio,
    audioTimeS: 0,
    chartCursor: 0,
    dtMs: 0,
    events,
    notesSpawned: 0,
    pressQueue: [],
    scheduledClickUntilS: 0,
    scores: { good: 0, miss: 0, ok: 0, perfect: 0 },
    world,
  };
  resetGame(state);

  const scheduler = new Scheduler<GameState>()
    .add(spawnSystem)
    .add(inputSystem)
    .add(cullSystem);

  const tickSource = new AudioClockTickSource(audio.ctx);
  const runner = new TickRunner<GameState>({
    scheduler,
    source: tickSource,
    getEvents: ctx => ctx.events,
    getWorld: () => state.world,
    contextFactory: (info) => {
      state.audioTimeS = audio.ctx.currentTime;
      state.dtMs = info.deltaMs ?? 0;
      return state;
    },
  });

  // Per-frame render + feedback state (rendering is not a scheduled
  // system — it's a view over world state driven off the same tick).
  let feedback: RenderFeedback | null = null;
  const laneFlashUntilS = [0, 0, 0, 0];
  const unsubscribeRender = tickSource.subscribe(() => {
    render(ctx2d, { feedback, laneFlashUntilS, state });
  });

  events.on('NoteJudged', (e) => {
    feedback = {
      hit: e.hit,
      lane: e.lane,
      offsetMs: e.offsetMs,
      timeS: state.audioTimeS,
    };
  });

  runner.start();
  tickSource.start();

  const keyboard = new KeyboardProvider({
    preventDefaultCodes: [Key.KeyD, Key.KeyF, Key.KeyJ, Key.KeyK, Key.KeyR],
  });
  // Presses are judged against the audio clock at the moment the key event
  // fires, so they dispatch immediately rather than waiting for a tick.
  const input = createEventInput<RhythmAction>(
    {
      lane0: [Key.KeyD],
      lane1: [Key.KeyF],
      lane2: [Key.KeyJ],
      lane3: [Key.KeyK],
      reset: [Key.KeyR],
    },
    [keyboard],
  );
  const unsubscribeKeys = input.subscribe(({ action, kind }) => {
    if (kind !== 'down')
      return;
    if (action === 'reset') {
      resetGame(state);
      feedback = null;
      return;
    }
    const lane = LANE_OF[action];
    const timeS = audio.ctx.currentTime;
    state.pressQueue.push({ lane, timeS });
    laneFlashUntilS[lane] = timeS + 0.12;
  });

  // Browsers block AudioContext until a user gesture. Click to resume.
  const onClick = (): void => {
    void audio.resume();
  };
  canvas.addEventListener('click', onClick);

  return (): void => {
    canvas.removeEventListener('click', onClick);
    unsubscribeKeys();
    input.dispose();
    unsubscribeRender();
    tickSource.stop();
    runner.stop();
    audio.dispose();
    container.innerHTML = '';
  };
}
