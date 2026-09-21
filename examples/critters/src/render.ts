import type { Behavior, GameState } from './game';

import {
  CRITTER_RADIUS,
  FOOD_RADIUS,
  HOMES,
  PositionDef,
  SCREEN_H,
  SCREEN_W,
  THREAT_RADIUS,
} from './game';

const BEHAVIOR_COLORS: Record<Behavior, string> = {
  eat: '#8fe08f',
  flee: '#e0503a',
  idle: '#9aa6a0',
  rest: '#7fb0ff',
  seekFood: '#5fbf5f',
  seekHome: '#5a8fe0',
  wander: '#9aa6a0',
};

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#0b120c';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawHomes(ctx);
  drawFood(ctx, state);
  for (const c of state.critters)
    drawCritter(ctx, state, c);
  drawCursor(ctx, state);
}

function drawHomes(ctx: CanvasRenderingContext2D): void {
  for (const h of HOMES) {
    ctx.beginPath();
    ctx.arc(h.x, h.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(90, 143, 224, 0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 143, 224, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawFood(ctx: CanvasRenderingContext2D, state: GameState): void {
  const posStore = state.world.getStore(PositionDef);
  for (const id of state.foodIds) {
    const p = posStore.get(id);
    if (!p)
      continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, FOOD_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#cfe06a';
    ctx.fill();
  }
}

function drawCritter(ctx: CanvasRenderingContext2D, state: GameState, c: GameState['critters'][number]): void {
  const p = state.world.getStore(PositionDef).get(c.id);
  if (!p)
    return;
  ctx.beginPath();
  ctx.arc(p.x, p.y, CRITTER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = BEHAVIOR_COLORS[c.behavior];
  ctx.fill();

  drawMeter(ctx, p.x - 10, p.y - CRITTER_RADIUS - 9, c.hunger, '#e8a24a');
  drawMeter(ctx, p.x - 10, p.y - CRITTER_RADIUS - 5, c.energy, '#4ad6e8');
}

function drawMeter(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, color: string): void {
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x, y, 20, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 20 * Math.max(0, Math.min(1, value)), 3);
}

function drawCursor(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { pointer } = state;
  if (!pointer.over)
    return;
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, THREAT_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(224, 80, 58, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pointer.x, pointer.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#e0503a';
  ctx.fill();
}
