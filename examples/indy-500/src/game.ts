import type { EntityId, EventBus } from '@pierre/ecs';
import type { InputState } from '@pierre/ecs/modules/input';
import type { RandomFn } from '@pierre/ecs/modules/rng';

import type { Track } from './track';

import { EcsWorld } from '@pierre/ecs';
import { makeSeededRng } from '@pierre/ecs/modules/rng';

import { CAR_RADIUS } from './car';
import { CarDef, CarTag, PositionDef } from './components';
import { pointAt, TRACKS } from './track';

export type DriveAction = 'brake' | 'left' | 'right' | 'throttle';
export type MenuAction = 'back' | 'confirm' | 'down' | 'left' | 'right' | 'up';

export type Mode = 'crash' | 'race' | 'tag';
/** Who car 2 is: nobody (race the clock), the AI, or a second player. */
export type Opponent = 'ai' | 'clock' | 'human';
export type Phase = 'countdown' | 'finished' | 'menu' | 'racing';

export const MODES: readonly Mode[] = ['race', 'crash', 'tag'];
export const OPPONENTS: readonly Opponent[] = ['clock', 'ai', 'human'];
export const LAP_OPTIONS: readonly number[] = [3, 5, 10, 25];

export const MODE_LABEL: Record<Mode, string> = { crash: 'Crash & Score', race: 'Race', tag: 'Tag' };
export const OPPONENT_LABEL: Record<Opponent, string> = { ai: '1 player vs AI', clock: '1 player vs the clock', human: '2 players' };

/** Hits needed to win Crash & Score. */
export const CRASH_GOAL = 5;
/** Points needed to win Tag. */
export const TAG_GOAL = 30;
/** Points the chaser earns for a tag; the blinking car earns 1 per second. */
export const TAG_BONUS = 3;
export const TAG_IMMUNE_MS = 1500;
export const COUNTDOWN_MS = 3000;
export const TARGET_RADIUS = 11;
/** How far behind the line the cars line up. */
export const GRID_OFFSET = 34;

/** Menu rows, top to bottom. */
export type MenuRow = 'laps' | 'mode' | 'opponent' | 'start' | 'track';

export interface MenuState {
  laps: number;
  mode: number;
  opponent: number;
  row: number;
  track: number;
}

export interface GameState {
  carIds: EntityId[];
  countdownMs: number;
  drive: [InputState<DriveAction>, InputState<DriveAction>];
  dtMs: number;
  events: EventBus<never>;
  /** Tag: remaining ms during which the car that was just tagged cannot be tagged back. */
  immuneMs: number;
  /** Slot of the car that is currently "it" in tag (the blinking car). */
  itSlot: number;
  lapTarget: number;
  menu: MenuState;
  menuInput: InputState<MenuAction>;
  mode: Mode;
  opponent: Opponent;
  phase: Phase;
  raceMs: number;
  rng: RandomFn;
  /** Crash & Score: the square to hit, or null outside that mode. */
  target: { x: number; y: number } | null;
  track: Track;
  /** Slot of the winner once `phase` is `finished`. */
  winner: number | null;
  world: EcsWorld;
}

export function makeWorld(): EcsWorld {
  const w = new EcsWorld();
  w.registerComponent(PositionDef);
  w.registerComponent(CarDef);
  w.registerTag(CarTag);
  return w;
}

export function initialMenu(): MenuState {
  return { laps: 0, mode: 0, opponent: 1, row: 4, track: 0 };
}

/** Rows shown for the chosen mode (the lap count only matters when racing). */
export function menuRows(mode: Mode): MenuRow[] {
  return mode === 'race' ? ['mode', 'track', 'opponent', 'laps', 'start'] : ['mode', 'track', 'opponent', 'start'];
}

/** Opponents a mode can be played with: only Race can be run against the clock. */
export function opponentsFor(mode: Mode): Opponent[] {
  return mode === 'race' ? [...OPPONENTS] : ['ai', 'human'];
}

/** A random spot on the track, kept clear of the walls and of the cars. */
export function randomTarget(state: GameState): { x: number; y: number } {
  const margin = TARGET_RADIUS + CAR_RADIUS + 4;
  for (let attempt = 0; attempt < 12; attempt++) {
    const p = pointAt(state.track, state.rng() * state.track.length);
    const lateral = (state.rng() * 2 - 1) * (state.track.halfWidth - margin);
    const x = p.x - p.ty * lateral;
    const y = p.y + p.tx * lateral;
    const clear = state.carIds.every((id) => {
      const pos = state.world.getStore(PositionDef).get(id)!;
      return Math.hypot(pos.x - x, pos.y - y) > margin * 2;
    });
    if (clear)
      return { x, y };
  }
  const p = pointAt(state.track, state.rng() * state.track.length);
  return { x: p.x, y: p.y };
}

/** Lay out a fresh race from the menu choices: cars on the grid, countdown running. */
export function startRace(state: GameState, seed: number): void {
  const { menu } = state;
  state.mode = MODES[menu.mode]!;
  state.track = TRACKS[menu.track]!;
  const options = opponentsFor(state.mode);
  state.opponent = options.includes(OPPONENTS[menu.opponent]!) ? OPPONENTS[menu.opponent]! : options[0]!;
  state.lapTarget = LAP_OPTIONS[menu.laps]!;
  state.rng = makeSeededRng(seed);
  state.phase = 'countdown';
  state.countdownMs = COUNTDOWN_MS;
  state.raceMs = 0;
  state.winner = null;
  state.itSlot = 0;
  state.immuneMs = 0;
  state.target = null;
  state.world.clearAll();
  state.carIds = [];

  const count = state.opponent === 'clock' ? 1 : 2;
  const start = pointAt(state.track, state.track.length - GRID_OFFSET);
  for (let slot = 0; slot < count; slot++) {
    const lateral = (slot === 0 ? -1 : 1) * state.track.halfWidth * 0.4;
    const id = state.world.createEntity();
    state.world.getStore(PositionDef).set(id, { x: start.x - start.ty * lateral, y: start.y + start.tx * lateral });
    state.world.getStore(CarDef).set(id, {
      bestLapMs: 0,
      finished: false,
      heading: Math.atan2(start.ty, start.tx),
      isAi: slot === 1 && state.opponent === 'ai',
      laps: 0,
      lapStartMs: 0,
      progress: -GRID_OFFSET,
      s: state.track.length - GRID_OFFSET,
      score: 0,
      slot,
      speed: 0,
      steer: 0,
      throttle: 0,
    });
    state.world.getTag(CarTag).add(id);
    state.carIds.push(id);
  }
  if (state.mode === 'crash')
    state.target = randomTarget(state);
}

export function backToMenu(state: GameState): void {
  state.world.clearAll();
  state.carIds = [];
  state.target = null;
  state.phase = 'menu';
}
