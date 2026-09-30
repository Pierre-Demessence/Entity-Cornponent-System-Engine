import type { GameState } from './game';

import { CAR_RADIUS } from './car';
import { CarDef, PositionDef } from './components';
import {
  CRASH_GOAL,
  LAP_OPTIONS,
  menuRows,
  MODE_LABEL,
  MODES,
  OPPONENT_LABEL,
  OPPONENTS,
  TAG_GOAL,
  TARGET_RADIUS,
} from './game';
import { pointAt, TRACKS, WORLD_H, WORLD_W } from './track';

export const VIEW_W = WORLD_W;
export const VIEW_H = WORLD_H;

const CAR_COLORS = ['#ff5a4e', '#4ea8ff'];
const FONT = 'system-ui, sans-serif';

/** m:ss.cc */
export function formatTime(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function trace(ctx2d: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
  ctx2d.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx2d.moveTo(p.x, p.y) : ctx2d.lineTo(p.x, p.y)));
  ctx2d.closePath();
}

function drawTrack(ctx2d: CanvasRenderingContext2D, track: (typeof TRACKS)[number]): void {
  ctx2d.lineJoin = 'round';
  trace(ctx2d, track.points);
  ctx2d.strokeStyle = '#e8e8e8';
  ctx2d.lineWidth = track.halfWidth * 2 + 6;
  ctx2d.stroke();
  ctx2d.strokeStyle = '#3a3d47';
  ctx2d.lineWidth = track.halfWidth * 2;
  ctx2d.stroke();
  ctx2d.strokeStyle = '#575b68';
  ctx2d.lineWidth = 2;
  ctx2d.setLineDash([14, 14]);
  ctx2d.stroke();
  ctx2d.setLineDash([]);

  // Finish line: a checkered strip across the corridor at arc length 0.
  const line = pointAt(track, 0);
  const nx = -line.ty;
  const ny = line.tx;
  const cells = 8;
  const cell = (track.halfWidth * 2) / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < 2; j++) {
      ctx2d.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#111';
      const along = (j - 1) * 5;
      const across = -track.halfWidth + i * cell;
      const px = line.x + nx * across + line.tx * along;
      const py = line.y + ny * across + line.ty * along;
      ctx2d.beginPath();
      ctx2d.moveTo(px, py);
      ctx2d.lineTo(px + nx * cell, py + ny * cell);
      ctx2d.lineTo(px + nx * cell + line.tx * 5, py + ny * cell + line.ty * 5);
      ctx2d.lineTo(px + line.tx * 5, py + line.ty * 5);
      ctx2d.closePath();
      ctx2d.fill();
    }
  }
}

function drawCar(ctx2d: CanvasRenderingContext2D, x: number, y: number, heading: number, color: string, alpha: number): void {
  ctx2d.save();
  ctx2d.globalAlpha = alpha;
  ctx2d.translate(x, y);
  ctx2d.rotate(heading);
  ctx2d.fillStyle = color;
  ctx2d.fillRect(-CAR_RADIUS - 2, -CAR_RADIUS + 2, CAR_RADIUS * 2 + 4, CAR_RADIUS * 2 - 4);
  ctx2d.fillStyle = '#111';
  ctx2d.fillRect(2, -CAR_RADIUS + 4, 5, CAR_RADIUS * 2 - 8);
  ctx2d.restore();
}

function text(ctx2d: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = '#fff', align: CanvasTextAlign = 'left'): void {
  ctx2d.fillStyle = color;
  ctx2d.textAlign = align;
  ctx2d.font = `bold ${size}px ${FONT}`;
  ctx2d.fillText(s, x, y);
}

function drawMenu(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const { menu } = state;
  const mode = MODES[menu.mode]!;
  text(ctx2d, 'INDY 500', VIEW_W / 2, 120, 56, '#ffd84a', 'center');
  const rows = menuRows(mode);
  const values: Record<string, string> = {
    laps: `${LAP_OPTIONS[menu.laps]} laps`,
    mode: MODE_LABEL[mode],
    opponent: OPPONENT_LABEL[OPPONENTS[menu.opponent]!],
    start: 'Start',
    track: TRACKS[menu.track]!.name,
  };
  const labels: Record<string, string> = { laps: 'Length', mode: 'Game', opponent: 'Players', start: '', track: 'Track' };
  rows.forEach((row, i) => {
    const y = 220 + i * 52;
    const active = i === menu.row;
    const color = active ? '#fff' : '#8a90a6';
    if (row === 'start') {
      text(ctx2d, `${active ? '▶ ' : ''}${values.start}${active ? ' ◀' : ''}`, VIEW_W / 2, y, 30, active ? '#7CFC9B' : '#8a90a6', 'center');
      return;
    }
    text(ctx2d, labels[row]!, 200, y, 24, '#8a90a6');
    text(ctx2d, `${active ? '◀ ' : ''}${values[row]}${active ? ' ▶' : ''}`, 600, y, 24, color, 'right');
  });
  text(ctx2d, 'Up/Down choose  ·  Left/Right change  ·  Enter start', VIEW_W / 2, VIEW_H - 40, 16, '#8a90a6', 'center');
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const cars = state.carIds.map(id => state.world.getStore(CarDef).get(id)!);
  cars.forEach((car, i) => {
    const x = i === 0 ? 16 : VIEW_W - 16;
    const align: CanvasTextAlign = i === 0 ? 'left' : 'right';
    const who = car.isAi ? 'AI' : `P${i + 1}`;
    text(ctx2d, who, x, 26, 18, CAR_COLORS[i]!, align);
    if (state.mode === 'race') {
      text(ctx2d, `Lap ${Math.min(car.laps + 1, state.lapTarget)}/${state.lapTarget}`, x, 48, 16, '#fff', align);
      text(ctx2d, car.bestLapMs > 0 ? `Best ${formatTime(car.bestLapMs)}` : 'Best --', x, 68, 14, '#9aa', align);
    }
    else {
      const goal = state.mode === 'crash' ? CRASH_GOAL : TAG_GOAL;
      text(ctx2d, `Score ${car.score}/${goal}`, x, 48, 16, '#fff', align);
    }
  });
  if (state.mode === 'race')
    text(ctx2d, formatTime(state.raceMs), VIEW_W / 2, 26, 20, '#fff', 'center');
  else
    text(ctx2d, `${MODE_LABEL[state.mode]} · ${formatTime(state.raceMs)}`, VIEW_W / 2, 26, 16, '#fff', 'center');
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState, nowMs: number): void {
  ctx2d.fillStyle = '#1c5a2e';
  ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
  if (state.phase === 'menu') {
    ctx2d.fillStyle = 'rgba(0,0,0,0.55)';
    ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTrack(ctx2d, TRACKS[state.menu.track]!);
    ctx2d.fillStyle = 'rgba(11,16,33,0.82)';
    ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
    drawMenu(ctx2d, state);
    return;
  }

  drawTrack(ctx2d, state.track);

  if (state.target) {
    const pulse = 0.75 + 0.25 * Math.sin(nowMs / 120);
    ctx2d.fillStyle = `rgba(255,255,255,${pulse})`;
    ctx2d.fillRect(state.target.x - TARGET_RADIUS, state.target.y - TARGET_RADIUS, TARGET_RADIUS * 2, TARGET_RADIUS * 2);
  }

  state.carIds.forEach((id, i) => {
    const pos = state.world.getStore(PositionDef).get(id)!;
    const car = state.world.getStore(CarDef).get(id)!;
    const blinking = state.mode === 'tag' && state.itSlot === i && Math.floor(nowMs / 140) % 2 === 0;
    drawCar(ctx2d, pos.x, pos.y, car.heading, blinking ? '#ffffff' : CAR_COLORS[i]!, 1);
  });

  drawHud(ctx2d, state);

  if (state.phase === 'countdown') {
    text(ctx2d, String(Math.ceil(state.countdownMs / 1000)), VIEW_W / 2, VIEW_H / 2 + 24, 90, '#ffd84a', 'center');
  }
  else if (state.phase === 'finished') {
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, VIEW_H / 2 - 90, VIEW_W, 180);
    const winner = state.winner ?? 0;
    const who = state.opponent === 'clock' ? 'Finished!' : state.carIds.length > 1 && state.opponent === 'ai' && winner === 1 ? 'AI wins' : `Player ${winner + 1} wins`;
    text(ctx2d, who, VIEW_W / 2, VIEW_H / 2 - 20, 44, '#ffd84a', 'center');
    const car = state.world.getStore(CarDef).get(state.carIds[winner]!)!;
    if (state.mode === 'race')
      text(ctx2d, `Time ${formatTime(state.raceMs)}  ·  Best lap ${formatTime(car.bestLapMs)}`, VIEW_W / 2, VIEW_H / 2 + 20, 20, '#fff', 'center');
    text(ctx2d, 'Enter rematch  ·  Esc menu', VIEW_W / 2, VIEW_H / 2 + 60, 18, '#9aa', 'center');
  }
}
