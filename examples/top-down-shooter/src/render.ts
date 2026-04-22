import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { BulletTag, EnemyTag } from './components';
import { SCREEN_H, SCREEN_W } from './game';

const canvas2d = new Canvas2DRenderer();

interface FpsMeter {
  frames: number;
  lastMs: number;
  value: number;
}

export function createFpsMeter(): FpsMeter {
  return { frames: 0, lastMs: performance.now(), value: 0 };
}

export function sampleFps(meter: FpsMeter): void {
  meter.frames += 1;
  const now = performance.now();
  const elapsed = now - meter.lastMs;
  if (elapsed >= 500) {
    meter.value = Math.round((meter.frames * 1000) / elapsed);
    meter.frames = 0;
    meter.lastMs = now;
  }
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState, fps: number): void {
  ctx2d.fillStyle = '#fff';
  ctx2d.font = '16px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'alphabetic';
  ctx2d.fillText(`Score: ${state.score}`, 12, 22);
  const enemies = state.world.getTag(EnemyTag).size;
  const bullets = state.world.getTag(BulletTag).size;
  ctx2d.fillStyle = '#aac';
  ctx2d.font = '12px system-ui, sans-serif';
  ctx2d.fillText(`FPS ${fps}  ·  enemies ${enemies}  ·  bullets ${bullets}`, 12, 40);
}

function drawCrosshair(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const ax = state.pointer.x;
  const ay = state.pointer.y;
  ctx2d.save();
  ctx2d.strokeStyle = '#8cf';
  ctx2d.lineWidth = 1;
  ctx2d.globalAlpha = 0.6;
  ctx2d.beginPath();
  ctx2d.arc(ax, ay, 8, 0, Math.PI * 2);
  ctx2d.moveTo(ax - 12, ay);
  ctx2d.lineTo(ax - 4, ay);
  ctx2d.moveTo(ax + 4, ay);
  ctx2d.lineTo(ax + 12, ay);
  ctx2d.moveTo(ax, ay - 12);
  ctx2d.lineTo(ax, ay - 4);
  ctx2d.moveTo(ax, ay + 4);
  ctx2d.lineTo(ax, ay + 12);
  ctx2d.stroke();
  ctx2d.restore();
}

function drawGameOver(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.save();
  ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx2d.fillStyle = '#f88';
  ctx2d.textAlign = 'center';
  ctx2d.textBaseline = 'middle';
  ctx2d.font = 'bold 40px system-ui, sans-serif';
  ctx2d.fillText('Game Over', SCREEN_W / 2, SCREEN_H / 2 - 20);
  ctx2d.fillStyle = '#eee';
  ctx2d.font = '18px system-ui, sans-serif';
  ctx2d.fillText(`Final score: ${state.score}`, SCREEN_W / 2, SCREEN_H / 2 + 14);
  ctx2d.fillStyle = '#aac';
  ctx2d.font = '14px system-ui, sans-serif';
  ctx2d.fillText('Press R to restart', SCREEN_W / 2, SCREEN_H / 2 + 44);
  ctx2d.restore();
}

export function render(
  ctx2d: CanvasRenderingContext2D,
  state: GameState,
  fpsMeter: FpsMeter,
): void {
  sampleFps(fpsMeter);
  ctx2d.fillStyle = '#0d1016';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);

  drawCrosshair(ctx2d, state);
  drawHud(ctx2d, state, fpsMeter.value);
  if (state.dead)
    drawGameOver(ctx2d, state);
}
