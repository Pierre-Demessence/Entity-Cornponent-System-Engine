import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState, PlayerSlot } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { SCREEN_H, SCREEN_W, STAR_RADIUS } from './game';

const canvas2d = new Canvas2DRenderer();

const PLAYER_COLORS: Record<PlayerSlot, string> = { 1: '#6cf', 2: '#f66' };

function drawStarGlow(ctx2d: CanvasRenderingContext2D): void {
  const cx = SCREEN_W / 2;
  const cy = SCREEN_H / 2;

  // Outer glow rings
  for (let i = 3; i >= 0; i--) {
    const r = STAR_RADIUS + 8 + i * 10;
    const alpha = 0.08 + i * 0.04;
    ctx2d.fillStyle = `rgba(255, 238, 136, ${alpha})`;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, r, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.font = '16px system-ui, sans-serif';

  // Player 1 score (left)
  ctx2d.fillStyle = PLAYER_COLORS[1];
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`P1: ${state.scores[1]}`, 12, 22);

  // Player 2 score (right)
  ctx2d.fillStyle = PLAYER_COLORS[2];
  ctx2d.textAlign = 'right';
  ctx2d.fillText(`P2: ${state.scores[2]}`, SCREEN_W - 12, 22);

  // Game over overlay
  if (state.dead && state.winner != null) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

    ctx2d.textAlign = 'center';
    ctx2d.fillStyle = PLAYER_COLORS[state.winner];
    ctx2d.font = 'bold 28px system-ui, sans-serif';
    const label = state.winner === 1 ? 'Player 1' : 'Player 2';
    ctx2d.fillText(`${label} Wins!`, SCREEN_W / 2, SCREEN_H / 2 - 10);

    ctx2d.fillStyle = '#ccc';
    ctx2d.font = '14px system-ui, sans-serif';
    ctx2d.fillText('Press R to restart', SCREEN_W / 2, SCREEN_H / 2 + 18);
  }
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#050510';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Star glow (behind all entities)
  drawStarGlow(ctx2d);

  // Draw entities via the canvas2d renderer
  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawHud(ctx2d, state);
}
