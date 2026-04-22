import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { SCREEN_H, SCREEN_W } from './game';

const canvas2d = new Canvas2DRenderer();

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#fff';
  ctx2d.font = '16px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`Score: ${state.score}`, 12, 22);
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#1a1d28';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawHud(ctx2d, state);
}
