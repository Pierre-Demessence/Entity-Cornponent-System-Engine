import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import {
  PLAY_LEFT,
  PLAY_RIGHT,
  SCREEN_H,
  SCREEN_W,
  WALL,
} from './game';

const canvas2d = new Canvas2DRenderer();

function drawWalls(ctx2d: CanvasRenderingContext2D): void {
  ctx2d.fillStyle = '#1b2444';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx2d.fillStyle = '#2c3a6b';
  ctx2d.fillRect(0, 0, WALL, SCREEN_H);
  ctx2d.fillRect(PLAY_RIGHT, 0, WALL, SCREEN_H);
  ctx2d.fillRect(0, 0, SCREEN_W, WALL);
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#dfe7f5';
  ctx2d.font = 'bold 20px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`Score ${state.score}`, PLAY_LEFT + 6, SCREEN_H - 16);

  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#9fb0c4';
  ctx2d.fillText(`Best ${state.best}`, SCREEN_W / 2, SCREEN_H - 16);

  ctx2d.textAlign = 'right';
  ctx2d.fillStyle = '#ffd23f';
  ctx2d.fillText('●'.repeat(Math.max(0, state.lives)), PLAY_RIGHT - 6, SCREEN_H - 16);

  if (!state.launched && !state.dead) {
    ctx2d.fillStyle = '#cdd7ea';
    ctx2d.font = '17px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('Space / Click to launch', SCREEN_W / 2, SCREEN_H * 0.62);
  }

  if (state.dead) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.fillStyle = state.won ? '#6cbf3a' : '#fff';
    ctx2d.font = 'bold 36px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(state.won ? 'You Win!' : 'Game Over', SCREEN_W / 2, SCREEN_H / 2 - 26);
    ctx2d.fillStyle = '#fff';
    ctx2d.font = '20px system-ui, sans-serif';
    ctx2d.fillText(`Score ${state.score}   ·   Best ${state.best}`, SCREEN_W / 2, SCREEN_H / 2 + 8);
    ctx2d.font = '16px system-ui, sans-serif';
    ctx2d.fillText('Press R to play again', SCREEN_W / 2, SCREEN_H / 2 + 42);
  }
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  drawWalls(ctx2d);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawHud(ctx2d, state);
}
