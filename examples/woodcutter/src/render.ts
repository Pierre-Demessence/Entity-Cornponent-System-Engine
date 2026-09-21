import type { GameState, Worker } from './game';

import {
  AXE_RACK,
  PositionDef,
  SCREEN_H,
  SCREEN_W,
  STORE,
  TREES,
  WORKER_RADIUS,
} from './game';

export function render(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#0e0b08';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawStations(ctx);
  for (const w of state.workers)
    drawWorker(ctx, state, w);
  drawScore(ctx, state);
}

function drawStations(ctx: CanvasRenderingContext2D): void {
  // Axe rack.
  ctx.fillStyle = '#b8b0c0';
  ctx.fillRect(AXE_RACK.x - 12, AXE_RACK.y - 12, 24, 24);
  label(ctx, 'axes', AXE_RACK.x, AXE_RACK.y - 20);

  // Trees.
  for (const t of TREES) {
    ctx.beginPath();
    ctx.moveTo(t.x, t.y - 18);
    ctx.lineTo(t.x - 14, t.y + 12);
    ctx.lineTo(t.x + 14, t.y + 12);
    ctx.closePath();
    ctx.fillStyle = '#3f8f4d';
    ctx.fill();
  }
  if (TREES[0])
    label(ctx, 'trees', TREES[0].x, TREES[0].y + 28);

  // Store.
  ctx.fillStyle = '#8a5a34';
  ctx.fillRect(STORE.x - 18, STORE.y - 14, 36, 28);
  label(ctx, 'store', STORE.x, STORE.y - 22);
}

function drawWorker(ctx: CanvasRenderingContext2D, state: GameState, w: Worker): void {
  const p = state.world.getStore(PositionDef).get(w.id);
  if (!p)
    return;

  ctx.beginPath();
  ctx.arc(p.x, p.y, WORKER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#d8a24a';
  ctx.fill();

  if (w.hasAxe) {
    ctx.fillStyle = '#dcdce4';
    ctx.fillRect(p.x + WORKER_RADIUS - 2, p.y - WORKER_RADIUS, 4, 10); // axe on the back
  }
  if (w.hasWood) {
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(p.x - 4, p.y - WORKER_RADIUS - 6, 8, 5); // carried log
  }

  const step = w.plan && w.planIndex < w.plan.length ? w.plan[w.planIndex].name : '…';
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px system-ui';
  ctx.fillStyle = '#ffe9c4';
  ctx.fillText(`▶ ${step}`, p.x, p.y - WORKER_RADIUS - 16);
  ctx.font = '10px system-ui';
  ctx.fillStyle = 'rgba(230,220,203,0.5)';
  ctx.fillText(w.planLabel, p.x, p.y - WORKER_RADIUS - 30);
}

function drawScore(ctx: CanvasRenderingContext2D, state: GameState): void {
  const total = state.workers.reduce((sum, w) => sum + w.delivered, 0);
  ctx.textAlign = 'left';
  ctx.font = '14px system-ui';
  ctx.fillStyle = '#e6dccb';
  ctx.fillText(`Logs delivered: ${total}`, 14, 24);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.textAlign = 'center';
  ctx.font = '11px system-ui';
  ctx.fillStyle = 'rgba(230,220,203,0.6)';
  ctx.fillText(text, x, y);
}
