import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { SCREEN_H, SCREEN_W } from './game';

const canvas2d = new Canvas2DRenderer();

// A fixed starfield so the background reads as space without per-frame churn.
const STARS = Array.from({ length: 70 }, () => ({
  r: Math.random() < 0.85 ? 1 : 2,
  x: Math.random() * SCREEN_W,
  y: Math.random() * SCREEN_H,
}));

function drawScene(ctx2d: CanvasRenderingContext2D): void {
  ctx2d.fillStyle = '#05060d';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx2d.fillStyle = 'rgba(180,200,255,0.5)';
  for (const s of STARS) {
    ctx2d.fillRect(s.x, s.y, s.r, s.r);
  }
  // Ground line the defenders stand on.
  ctx2d.strokeStyle = '#2f7d4d';
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.moveTo(0, SCREEN_H - 30);
  ctx2d.lineTo(SCREEN_W, SCREEN_H - 30);
  ctx2d.stroke();
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.textAlign = 'left';
  ctx2d.fillStyle = '#eef3ff';
  ctx2d.font = 'bold 20px system-ui, sans-serif';
  ctx2d.fillText(`Score ${state.score}`, 16, 28);

  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#9fb0d8';
  ctx2d.font = '15px system-ui, sans-serif';
  ctx2d.fillText(`Wave ${state.wave}`, SCREEN_W / 2, 26);
  ctx2d.fillText(`Best ${state.best}`, SCREEN_W / 2, 46);

  // Lives as little ship pips, top-right.
  ctx2d.textAlign = 'right';
  ctx2d.fillStyle = '#eef3ff';
  ctx2d.font = '15px system-ui, sans-serif';
  ctx2d.fillText('Lives', SCREEN_W - 16 - state.lives * 26, 28);
  ctx2d.fillStyle = '#7CFC9B';
  for (let i = 0; i < state.lives; i++) {
    ctx2d.fillRect(SCREEN_W - 16 - (i + 1) * 24, 16, 18, 10);
  }

  if (!state.started && !state.dead) {
    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = '#cdd7ea';
    ctx2d.font = '18px system-ui, sans-serif';
    ctx2d.fillText('← → / A D to move  ·  Space to fire', SCREEN_W / 2, SCREEN_H * 0.5);
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
      `Score ${state.score}   ·   Best ${state.best}   ·   Wave ${state.wave}`,
      SCREEN_W / 2,
      SCREEN_H / 2 + 10,
    );
    ctx2d.font = '16px system-ui, sans-serif';
    ctx2d.fillText('Press R or click to play again', SCREEN_W / 2, SCREEN_H / 2 + 44);
  }
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  drawScene(ctx2d);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawHud(ctx2d, state);
}
