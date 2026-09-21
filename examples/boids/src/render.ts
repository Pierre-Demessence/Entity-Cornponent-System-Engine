import type { GameState } from './game';

import { BoidTag, FoodTag, PositionDef, VelocityDef } from './components';
import { FLEE_RADIUS, MAX_SPEED, SCREEN_H, SCREEN_W } from './game';

const BOID_LEN = 11;
const BOID_WIDTH = 7;

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#0b0f14';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawFood(ctx, state);
  drawBoids(ctx, state);
  drawCursor(ctx, state);
}

function drawFood(ctx: CanvasRenderingContext2D, state: GameState): void {
  const posStore = state.world.getStore(PositionDef);
  for (const id of state.world.getTag(FoodTag)) {
    const p = posStore.get(id);
    if (!p)
      continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd25a';
    ctx.shadowColor = '#ffd25a';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawBoids(ctx: CanvasRenderingContext2D, state: GameState): void {
  const posStore = state.world.getStore(PositionDef);
  const velStore = state.world.getStore(VelocityDef);
  for (const id of state.world.getTag(BoidTag)) {
    const p = posStore.get(id);
    const v = velStore.get(id);
    if (!p || !v)
      continue;
    const angle = Math.atan2(v.vy, v.vx);
    const speed = Math.hypot(v.vx, v.vy);
    const hue = 190 + Math.min(1, speed / MAX_SPEED) * 60;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(BOID_LEN, 0);
    ctx.lineTo(-BOID_WIDTH * 0.6, BOID_WIDTH * 0.6);
    ctx.lineTo(-BOID_WIDTH * 0.6, -BOID_WIDTH * 0.6);
    ctx.closePath();
    ctx.fillStyle = `hsl(${hue}, 70%, 62%)`;
    ctx.fill();
    ctx.restore();
  }
}

function drawCursor(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { pointer } = state;
  if (!pointer.over)
    return;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, FLEE_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 96, 96, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff6060';
  ctx.fill();
}
