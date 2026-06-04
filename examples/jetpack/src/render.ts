import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { CEIL_Y, FLOOR_H, FLOOR_Y, SCREEN_H, SCREEN_W } from './game';

const canvas2d = new Canvas2DRenderer();

function drawScene(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#101936';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Parallax dashes on floor and ceiling, offset by travelled distance.
  const offset = state.distance % 80;
  ctx2d.strokeStyle = 'rgba(120,150,210,0.25)';
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  for (let x = -offset; x < SCREEN_W; x += 80) {
    ctx2d.moveTo(x, CEIL_Y + 14);
    ctx2d.lineTo(x + 40, CEIL_Y + 14);
    ctx2d.moveTo(x, FLOOR_Y - 14);
    ctx2d.lineTo(x + 40, FLOOR_Y - 14);
  }
  ctx2d.stroke();

  // Ceiling + floor slabs.
  ctx2d.fillStyle = '#2a3358';
  ctx2d.fillRect(0, 0, SCREEN_W, CEIL_Y);
  ctx2d.fillRect(0, FLOOR_Y, SCREEN_W, FLOOR_H);
  ctx2d.fillStyle = '#3c4a82';
  ctx2d.fillRect(0, FLOOR_Y, SCREEN_W, 5);
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.textAlign = 'left';
  ctx2d.fillStyle = '#eef3ff';
  ctx2d.font = 'bold 22px system-ui, sans-serif';
  ctx2d.fillText(`${state.score} m`, 16, 34);
  ctx2d.fillStyle = '#9fb0d8';
  ctx2d.font = '15px system-ui, sans-serif';
  ctx2d.fillText(`Best ${state.best} m`, 16, 56);

  if (!state.started && !state.dead) {
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = '#cdd7ea';
    ctx2d.font = '18px system-ui, sans-serif';
    ctx2d.fillText('Hold Space / ↑ / mouse to fly', SCREEN_W / 2, SCREEN_H * 0.45);
  }

  if (state.dead) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = '#fff';
    ctx2d.font = 'bold 36px system-ui, sans-serif';
    ctx2d.fillText('Crashed!', SCREEN_W / 2, SCREEN_H / 2 - 24);
    ctx2d.font = '20px system-ui, sans-serif';
    ctx2d.fillText(`${state.score} m   ·   Best ${state.best} m`, SCREEN_W / 2, SCREEN_H / 2 + 8);
    ctx2d.font = '16px system-ui, sans-serif';
    ctx2d.fillText('Press R or click to fly again', SCREEN_W / 2, SCREEN_H / 2 + 42);
  }
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  drawScene(ctx2d, state);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawHud(ctx2d, state);
}
