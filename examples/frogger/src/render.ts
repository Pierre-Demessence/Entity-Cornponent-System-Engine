import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { ObstacleDef, ObstacleTag, PositionDef, SizeDef, VelocityDef } from './components';
import {
  FROG,
  GOAL_ROW,
  HUD_H,
  MEDIAN_ROW,
  PAD_W,
  PLAYFIELD_H,
  rowFrogY,
  SCREEN_H,
  SCREEN_W,
  START_ROW,
  TILE,
} from './game';

const canvas2d = new Canvas2DRenderer();

function bandFill(row: number): string {
  if (row === GOAL_ROW)
    return '#123524';
  if (row >= 1 && row <= 5)
    return '#1b5fa6';
  if (row === MEDIAN_ROW || row === START_ROW)
    return '#2f7d4d';
  return '#2b2b33';
}

function drawScene(ctx2d: CanvasRenderingContext2D): void {
  for (let row = 0; row < PLAYFIELD_H / TILE; row++) {
    ctx2d.fillStyle = bandFill(row);
    ctx2d.fillRect(0, row * TILE, SCREEN_W, TILE);
  }

  // Dashed lane markers between adjacent road rows.
  ctx2d.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx2d.lineWidth = 2;
  ctx2d.setLineDash([18, 16]);
  for (let row = 8; row <= 11; row++) {
    const y = row * TILE;
    ctx2d.beginPath();
    ctx2d.moveTo(0, y);
    ctx2d.lineTo(SCREEN_W, y);
    ctx2d.stroke();
  }
  ctx2d.setLineDash([]);
}

function drawPads(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const cy = GOAL_ROW * TILE + TILE / 2;
  for (const pad of state.pads) {
    ctx2d.beginPath();
    ctx2d.arc(pad.cx, cy, PAD_W / 2, 0, Math.PI * 2);
    ctx2d.fillStyle = pad.filled ? '#2f7d4d' : '#0c2418';
    ctx2d.fill();
    ctx2d.lineWidth = 3;
    ctx2d.strokeStyle = pad.filled ? '#7CFC9B' : '#1f5d3f';
    ctx2d.stroke();
    if (pad.filled) {
      ctx2d.fillStyle = '#0a0c12';
      ctx2d.beginPath();
      ctx2d.arc(pad.cx - 6, cy - 4, 3, 0, Math.PI * 2);
      ctx2d.arc(pad.cx + 6, cy - 4, 3, 0, Math.PI * 2);
      ctx2d.fill();
    }
  }
}

/** Crocodile mouths are drawn over their bodies so the danger reads clearly. */
function drawCrocMouths(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const posStore = state.world.getStore(PositionDef);
  const sizeStore = state.world.getStore(SizeDef);
  const velStore = state.world.getStore(VelocityDef);
  const obStore = state.world.getStore(ObstacleDef);
  for (const id of state.world.getTag(ObstacleTag)) {
    const ob = obStore.get(id)!;
    if (ob.kind !== 'croc')
      continue;
    const pos = posStore.get(id)!;
    const size = sizeStore.get(id)!;
    const vx = velStore.get(id)!.vx;
    const mouthX = vx > 0 ? pos.x + size.w - TILE : pos.x;
    ctx2d.fillStyle = '#b3261e';
    ctx2d.fillRect(mouthX, pos.y + size.h / 2 - 3, TILE, 6);
    ctx2d.fillStyle = '#0a0c12';
    const eyeX = vx > 0 ? pos.x + size.w - 12 : pos.x + 12;
    ctx2d.beginPath();
    ctx2d.arc(eyeX, pos.y + 8, 3, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

function drawFrog(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  if (state.dying || state.frogId == null)
    return;
  const pos = state.world.getStore(PositionDef).get(state.frogId)!;
  ctx2d.fillStyle = '#7CFC9B';
  ctx2d.strokeStyle = '#2f7d4d';
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.roundRect(pos.x, pos.y, FROG, FROG, 9);
  ctx2d.fill();
  ctx2d.stroke();

  // Eyes biased toward the facing direction.
  const cx = pos.x + FROG / 2;
  const cy = pos.y + FROG / 2;
  let ex = 0;
  let ey = -6;
  if (state.facing === 'down')
    ey = 6;
  else if (state.facing === 'left')
    ex = -6;
  else if (state.facing === 'right')
    ex = 6;
  for (const sign of [-1, 1]) {
    const dx = state.facing === 'left' || state.facing === 'right' ? ex : sign * 6;
    const dy = state.facing === 'up' || state.facing === 'down' ? ey : sign * 6;
    ctx2d.fillStyle = '#fff';
    ctx2d.beginPath();
    ctx2d.arc(cx + dx, cy + dy, 4, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.fillStyle = '#0a0c12';
    ctx2d.beginPath();
    ctx2d.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const top = PLAYFIELD_H;
  ctx2d.fillStyle = '#0a0c12';
  ctx2d.fillRect(0, top, SCREEN_W, HUD_H);

  ctx2d.textAlign = 'left';
  ctx2d.fillStyle = '#eef3ff';
  ctx2d.font = 'bold 20px system-ui, sans-serif';
  ctx2d.fillText(`Score ${state.score}`, 16, top + 26);
  ctx2d.fillStyle = '#9fb0d8';
  ctx2d.font = '13px system-ui, sans-serif';
  ctx2d.fillText(`Best ${state.best}`, 16, top + 46);

  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#cdd7ea';
  ctx2d.font = '15px system-ui, sans-serif';
  ctx2d.fillText(`Level ${state.level}`, SCREEN_W / 2, top + 34);

  // Lives as little frog pips.
  ctx2d.textAlign = 'right';
  ctx2d.fillStyle = '#eef3ff';
  ctx2d.font = '14px system-ui, sans-serif';
  ctx2d.fillText('Lives', SCREEN_W - 16 - state.lives * 22, top + 32);
  ctx2d.fillStyle = '#7CFC9B';
  for (let i = 0; i < state.lives; i++) {
    ctx2d.beginPath();
    ctx2d.roundRect(SCREEN_W - 16 - (i + 1) * 20, top + 20, 14, 14, 4);
    ctx2d.fill();
  }
}

function drawOverlays(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  if (!state.started && !state.dead) {
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = 'rgba(10,12,18,0.55)';
    ctx2d.fillRect(0, START_ROW * TILE - 30, SCREEN_W, 60);
    ctx2d.fillStyle = '#eaf6ff';
    ctx2d.font = '18px system-ui, sans-serif';
    ctx2d.fillText('Arrows / W A S D to hop  ·  reach the lillypads', SCREEN_W / 2, rowFrogY(START_ROW) - 6);
  }

  if (state.levelFlashMs > 0 && !state.dead) {
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = `rgba(124,252,155,${Math.min(0.85, state.levelFlashMs / 1100)})`;
    ctx2d.font = 'bold 40px system-ui, sans-serif';
    ctx2d.fillText(`Level ${state.level}`, SCREEN_W / 2, PLAYFIELD_H / 2);
  }

  if (state.dead) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.62)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = '#fff';
    ctx2d.font = 'bold 38px system-ui, sans-serif';
    ctx2d.fillText('Game Over', SCREEN_W / 2, SCREEN_H / 2 - 24);
    ctx2d.font = '20px system-ui, sans-serif';
    ctx2d.fillText(
      `Score ${state.score}   ·   Best ${state.best}   ·   Level ${state.level}`,
      SCREEN_W / 2,
      SCREEN_H / 2 + 10,
    );
    ctx2d.font = '16px system-ui, sans-serif';
    ctx2d.fillText('Press R or click to play again', SCREEN_W / 2, SCREEN_H / 2 + 44);
  }
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  drawScene(ctx2d);
  drawPads(ctx2d, state);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawCrocMouths(ctx2d, state);
  drawFrog(ctx2d, state);
  drawHud(ctx2d, state);
  drawOverlays(ctx2d, state);
}
