import type { GameState, GuardBrain, GuardStateKey } from './game';

import {
  GUARD_RADIUS,
  PLAYER_RADIUS,
  PositionDef,
  SCREEN_H,
  SCREEN_W,
  VISION_HALF_ANGLE,
  VISION_RANGE,
} from './game';

const STATE_COLORS: Record<GuardStateKey, string> = {
  chase: '#e0503a',
  patrol: '#3fa34d',
  return: '#3a7fe0',
  search: '#e07f3a',
  suspicious: '#e0b23a',
};

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#0c0e12';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawWalls(ctx, state);
  for (const g of state.guards)
    drawVisionCone(ctx, state, g);
  for (const g of state.guards)
    drawGuard(ctx, state, g);
  drawPlayer(ctx, state);

  if (state.caught)
    drawCaught(ctx);
}

function drawWalls(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#2b3038';
  for (const w of state.walls)
    ctx.fillRect(w.x, w.y, w.w, w.h);
}

function drawVisionCone(ctx: CanvasRenderingContext2D, state: GameState, g: GuardBrain): void {
  const pos = state.world.getStore(PositionDef).get(g.id);
  if (!pos)
    return;
  const color = STATE_COLORS[g.fsm.current];
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.arc(pos.x, pos.y, VISION_RANGE, g.facing - VISION_HALF_ANGLE, g.facing + VISION_HALF_ANGLE);
  ctx.closePath();
  ctx.fillStyle = g.canSeePlayer ? `${color}44` : `${color}1f`;
  ctx.fill();
}

function drawGuard(ctx: CanvasRenderingContext2D, state: GameState, g: GuardBrain): void {
  const pos = state.world.getStore(PositionDef).get(g.id);
  if (!pos)
    return;
  const color = STATE_COLORS[g.fsm.current];
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, GUARD_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // Heading tick.
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  ctx.lineTo(pos.x + Math.cos(g.facing) * GUARD_RADIUS * 1.6, pos.y + Math.sin(g.facing) * GUARD_RADIUS * 1.6);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
  // State label.
  ctx.fillStyle = '#cdd4dc';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(g.fsm.current, pos.x, pos.y - GUARD_RADIUS - 6);
}

function drawPlayer(ctx: CanvasRenderingContext2D, state: GameState): void {
  const pos = state.world.getStore(PositionDef).get(state.playerId);
  if (!pos)
    return;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#8cf5ff';
  ctx.fill();
}

function drawCaught(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(180, 30, 30, 0.35)';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Caught!  Press R', SCREEN_W / 2, SCREEN_H / 2);
}
