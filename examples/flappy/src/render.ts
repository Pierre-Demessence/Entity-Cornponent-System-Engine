import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { PipeDef, PipeTag, PositionDef } from './components';
import {
  CEIL_Y,
  FLOOR_H,
  FLOOR_Y,
  PIPE_W,
  SCREEN_H,
  SCREEN_W,
} from './game';

const canvas2d = new Canvas2DRenderer();

function drawPipes(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const posStore = state.world.getStore(PositionDef);
  const pipeStore = state.world.getStore(PipeDef);
  for (const id of state.world.getTag(PipeTag)) {
    const pipe = pipeStore.get(id);
    const pos = posStore.get(id);
    if (!pipe || !pos)
      continue;
    const left = pos.x - PIPE_W / 2;
    const topH = pipe.gapY - pipe.gapHalf;
    const botY = pipe.gapY + pipe.gapHalf;

    ctx2d.fillStyle = '#5bbf3a';
    ctx2d.strokeStyle = '#2f6b1d';
    ctx2d.lineWidth = 3;
    ctx2d.fillRect(left, CEIL_Y, PIPE_W, topH);
    ctx2d.strokeRect(left, CEIL_Y, PIPE_W, topH);
    ctx2d.fillRect(left, botY, PIPE_W, FLOOR_Y - botY);
    ctx2d.strokeRect(left, botY, PIPE_W, FLOOR_Y - botY);

    // Lip on the gap-facing end of each pipe.
    ctx2d.fillRect(left - 4, topH - 18, PIPE_W + 8, 18);
    ctx2d.strokeRect(left - 4, topH - 18, PIPE_W + 8, 18);
    ctx2d.fillRect(left - 4, botY, PIPE_W + 8, 18);
    ctx2d.strokeRect(left - 4, botY, PIPE_W + 8, 18);
  }
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#fff';
  ctx2d.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx2d.lineWidth = 4;
  ctx2d.textAlign = 'center';
  ctx2d.font = 'bold 40px system-ui, sans-serif';
  ctx2d.strokeText(String(state.score), SCREEN_W / 2, 70);
  ctx2d.fillText(String(state.score), SCREEN_W / 2, 70);

  if (!state.started) {
    ctx2d.font = '18px system-ui, sans-serif';
    ctx2d.fillText('Click or press Space / Up to flap', SCREEN_W / 2, SCREEN_H * 0.62);
  }

  if (state.dead) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.55)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.fillStyle = '#fff';
    ctx2d.font = 'bold 34px system-ui, sans-serif';
    ctx2d.fillText('Game Over', SCREEN_W / 2, SCREEN_H / 2 - 30);
    ctx2d.font = '20px system-ui, sans-serif';
    ctx2d.fillText(`Score ${state.score}   ·   Best ${state.best}`, SCREEN_W / 2, SCREEN_H / 2 + 6);
    ctx2d.font = '16px system-ui, sans-serif';
    ctx2d.fillText('Click or press R to play again', SCREEN_W / 2, SCREEN_H / 2 + 40);
  }
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#4ec0ca';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawPipes(ctx2d, state);

  ctx2d.fillStyle = '#ded895';
  ctx2d.fillRect(0, FLOOR_Y, SCREEN_W, FLOOR_H);
  ctx2d.fillStyle = '#83b04b';
  ctx2d.fillRect(0, FLOOR_Y, SCREEN_W, 12);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawHud(ctx2d, state);
}
