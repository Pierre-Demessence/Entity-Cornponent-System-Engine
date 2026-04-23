/**
 * World, components, chart, and game state. No systems here — those
 * live in `systems.ts`. No rendering — that lives in `render.ts`.
 */

import type { EntityId, EventBus } from '@pierre/ecs';

import type { AudioEngine } from './audio';

import { EcsWorld, simpleComponent } from '@pierre/ecs';

/** Lanes 0..3 map to on-screen columns left-to-right (D, F, J, K). */
export type Lane = 0 | 1 | 2 | 3;
export const LANES: readonly Lane[] = [0, 1, 2, 3];

/** Per-note data. `hit` is kept as 0/1 to satisfy `simpleComponent`'s primitive schema. */
export interface Note {
  hit: number;
  lane: number;
  targetTimeS: number;
}

export const NoteDef = simpleComponent<Note>('note', {
  hit: 'number',
  lane: 'number',
  targetTimeS: 'number',
});

/** Beats-per-minute of the chart. Determines the click track. */
export const BPM = 120;
/** Seconds between beats, derived from BPM. */
export const BEAT_S = 60 / BPM;
/** Approach time: how long a note is visible before reaching the hit line. */
export const APPROACH_S = 1.6;
/** How long past the hit line a missed note lingers before despawn (visual). */
export const CULL_S = 0.25;

/** Timing windows in seconds (abs difference between press and target). */
export const WINDOW = {
  good: 0.1,
  ok: 0.2,
  perfect: 0.05,
};

/** 16 notes, one bar of 4/4 repeated four times with a little variety. */
const CHART_LANES: readonly Lane[] = [
  0,
  2,
  1,
  3,
  0,
  1,
  2,
  3,
  2,
  0,
  3,
  1,
  0,
  2,
  1,
  3,
];

export type Judgement = 'good' | 'miss' | 'ok' | 'perfect';

export type RhythmEvent
  = | { hit: Judgement; lane: number; offsetMs: number; type: 'NoteJudged' }
    | { type: 'NoteSpawned' };

export interface KeyPress {
  /** Audio-clock time the DOM event fired. */
  lane: Lane;
  timeS: number;
}

export interface GameState {
  readonly audio: AudioEngine;
  audioTimeS: number;
  /** Earliest target time still eligible for hit judgement. Monotonic. */
  chartCursor: number;
  dtMs: number;
  readonly events: EventBus<RhythmEvent>;
  /** Number of notes scheduled so far — used to know what to spawn next. */
  notesSpawned: number;
  /**
   * FIFO of keypresses captured by the DOM handler, each timestamped with
   * `audioCtx.currentTime` at the moment of the event. Drained by
   * `inputSystem` each tick.
   */
  readonly pressQueue: KeyPress[];
  /** Scheduled audio-time of the next metronome click. */
  scheduledClickUntilS: number;
  readonly scores: Record<Judgement, number>;
  readonly world: EcsWorld;
}

/** Returns the i-th note in the looping chart. */
export function chartNote(i: number): { lane: Lane; targetTimeS: number } {
  const lane = CHART_LANES[i % CHART_LANES.length]!;
  const targetTimeS = (i + 1) * BEAT_S;
  return { lane, targetTimeS };
}

export function makeWorld(): EcsWorld {
  const world = new EcsWorld();
  world.registerComponent(NoteDef);
  return world;
}

export function spawnNote(state: GameState, i: number): EntityId {
  const { lane, targetTimeS } = chartNote(i);
  const id = state.world.createEntity();
  state.world.getStore(NoteDef).set(id, { hit: 0, lane, targetTimeS });
  state.events.emit({ type: 'NoteSpawned' });
  return id;
}

export function resetGame(state: GameState): void {
  state.world.clearAll();
  state.chartCursor = 0;
  state.notesSpawned = 0;
  state.scheduledClickUntilS = 0;
  state.pressQueue.length = 0;
  for (const k of Object.keys(state.scores) as Judgement[])
    state.scores[k] = 0;
}
