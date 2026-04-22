import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { SCREEN_H, SCREEN_W } from './game';

const canvas2d = new Canvas2DRenderer();

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#ccc';
  ctx2d.font = '16px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`Score: ${state.score}`, 12, 22);

  if (state.dead) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.fillStyle = '#fff';
    ctx2d.textAlign = 'center';
    ctx2d.font = 'bold 28px system-ui, sans-serif';
    ctx2d.fillText('Game Over', SCREEN_W / 2, SCREEN_H / 2 - 10);
    ctx2d.font = '14px system-ui, sans-serif';
    ctx2d.fillText('Press R to restart', SCREEN_W / 2, SCREEN_H / 2 + 18);
  }
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx2d.strokeStyle = '#223';
  ctx2d.lineWidth = 2;
  ctx2d.strokeRect(1, 1, SCREEN_W - 2, SCREEN_H - 2);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawHud(ctx2d, state);
}
