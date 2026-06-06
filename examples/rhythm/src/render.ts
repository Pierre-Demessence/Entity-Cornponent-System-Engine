import type { GameState, Judgement } from './game';

import { easeOutCubic } from '@pierre/ecs/modules/easing';
import { clamp01 } from '@pierre/ecs/modules/math';

import {
  APPROACH_S,
  NoteDef,
  WINDOW,
} from './game';

export const CANVAS_W = 480;
export const CANVAS_H = 640;
export const HIT_LINE_Y = CANVAS_H - 120;
export const LANE_COUNT = 4;
export const LANE_GAP_X = 32;
export const LANE_W = (CANVAS_W - LANE_GAP_X * 2) / LANE_COUNT;

const LANE_COLORS = ['#ff6363', '#ffc163', '#63ffae', '#6ab4ff'];
const LANE_KEYS = ['D', 'F', 'J', 'K'];

/** Duration (s) over which a struck-lane highlight fades out. */
const LANE_FLASH_S = 0.125;
/** Duration (s) over which a hit / missed note fades out after its judgement. */
const NOTE_FADE_S = 0.25;
/** Duration (s) over which the judgement popup fades out. */
const JUDGEMENT_FADE_S = 0.6;

const JUDGEMENT_COLORS: Record<Judgement, string> = {
  good: '#9aff6a',
  miss: '#ff5555',
  ok: '#ffcc55',
  perfect: '#ffffff',
};

export interface RenderFeedback {
  hit: Judgement;
  lane: number;
  offsetMs: number;
  /** Audio time the event was observed, used to fade out. */
  timeS: number;
}

export interface RenderOpts {
  feedback: RenderFeedback | null;
  laneFlashUntilS: number[];
  state: GameState;
}

function laneX(lane: number): number {
  return LANE_GAP_X + lane * LANE_W;
}

export function render(
  ctx: CanvasRenderingContext2D,
  opts: RenderOpts,
): void {
  const { feedback, laneFlashUntilS, state } = opts;
  const now = state.audioTimeS;

  // Background.
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Lane backgrounds + flashes.
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const x = laneX(lane);
    ctx.fillStyle = '#15151f';
    ctx.fillRect(x, 0, LANE_W - 4, CANVAS_H);
    const flash = Math.max(0, laneFlashUntilS[lane]! - now);
    if (flash > 0) {
      // Ease the highlight out: bright near the strike, dropping off steeply as
      // it nears the end of the flash window (easeOutCubic).
      ctx.globalAlpha = easeOutCubic(clamp01(flash / LANE_FLASH_S)) * 0.5;
      ctx.fillStyle = LANE_COLORS[lane]!;
      ctx.fillRect(x, 0, LANE_W - 4, CANVAS_H);
      ctx.globalAlpha = 1;
    }
  }

  // Hit-line.
  ctx.fillStyle = '#333';
  ctx.fillRect(LANE_GAP_X, HIT_LINE_Y - 2, CANVAS_W - LANE_GAP_X * 2, 4);
  ctx.fillStyle = '#555';
  ctx.fillRect(LANE_GAP_X, HIT_LINE_Y - 6, CANVAS_W - LANE_GAP_X * 2, 1);

  // Lane key labels.
  ctx.font = 'bold 20px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    ctx.fillStyle = '#888';
    ctx.fillText(LANE_KEYS[lane]!, laneX(lane) + (LANE_W - 4) / 2, HIT_LINE_Y + 40);
  }

  // Notes.
  const notes = state.world.getStore(NoteDef);
  for (const [, note] of notes.entries()) {
    const remaining = note.targetTimeS - now;
    if (remaining > APPROACH_S + 0.05)
      continue;
    const progress = 1 - remaining / APPROACH_S; // 0 at top, 1 at hit line.
    const y = progress * HIT_LINE_Y;
    const x = laneX(note.lane);
    const w = LANE_W - 14;
    const h = 22;
    if (note.hit === 1) {
      ctx.globalAlpha = easeOutCubic(clamp01(1 - (now - note.targetTimeS) / NOTE_FADE_S));
      ctx.fillStyle = '#ffffff';
    }
    else if (note.hit === 2) {
      ctx.globalAlpha = easeOutCubic(clamp01(1 - (now - note.targetTimeS - WINDOW.ok) / NOTE_FADE_S));
      ctx.fillStyle = '#663333';
    }
    else {
      ctx.globalAlpha = 1;
      ctx.fillStyle = LANE_COLORS[note.lane]!;
    }
    ctx.fillRect(x + 5, y - h / 2, w, h);
    ctx.globalAlpha = 1;
  }

  // Scores.
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ddd';
  ctx.font = '13px system-ui';
  ctx.textAlign = 'left';
  const scoreLine = `Perfect ${state.scores.perfect}  ·  Good ${state.scores.good}  ·  OK ${state.scores.ok}  ·  Miss ${state.scores.miss}`;
  ctx.fillText(scoreLine, LANE_GAP_X, 22);

  // Last judgement popup.
  if (feedback) {
    const age = now - feedback.timeS;
    if (age < JUDGEMENT_FADE_S) {
      ctx.globalAlpha = easeOutCubic(clamp01(1 - age / JUDGEMENT_FADE_S));
      ctx.fillStyle = JUDGEMENT_COLORS[feedback.hit];
      ctx.font = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      const label = feedback.hit === 'miss'
        ? 'MISS'
        : `${feedback.hit.toUpperCase()} ${feedback.offsetMs >= 0 ? '+' : ''}${feedback.offsetMs.toFixed(0)}ms`;
      ctx.fillText(label, CANVAS_W / 2, HIT_LINE_Y - 60);
      ctx.globalAlpha = 1;
    }
  }

  ctx.textAlign = 'left';
}
