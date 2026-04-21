import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import {
  PositionDef,
  RadiusDef,
  RotationDef,
  ShipTag,
} from './components';
import { SCREEN_H, SCREEN_W } from './game';

const canvas2d = new Canvas2DRenderer();

function drawShip(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const posStore = state.world.getStore(PositionDef);
  const radStore = state.world.getStore(RadiusDef);
  for (const id of state.world.getTag(ShipTag)) {
    const p = posStore.get(id)!;
    const rot = state.world.getStore(RotationDef).get(id)!;
    const r = radStore.get(id)!.r;
    ctx2d.save();
    ctx2d.translate(p.x, p.y);
    ctx2d.rotate(rot.angle);
    ctx2d.strokeStyle = '#8cf';
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(r, 0);
    ctx2d.lineTo(-r * 0.7, r * 0.7);
    ctx2d.lineTo(-r * 0.4, 0);
    ctx2d.lineTo(-r * 0.7, -r * 0.7);
    ctx2d.closePath();
    ctx2d.stroke();
    if (state.input.isDown('thrust')) {
      ctx2d.strokeStyle = '#fa4';
      ctx2d.beginPath();
      ctx2d.moveTo(-r * 0.4, r * 0.35);
      ctx2d.lineTo(-r * 1.1, 0);
      ctx2d.lineTo(-r * 0.4, -r * 0.35);
      ctx2d.stroke();
    }
    ctx2d.restore();
  }
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#ccc';
  ctx2d.font = '16px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`Score: ${state.score}`, 12, 22);

  if (state.dead) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.fillStyle = '#fff';
    ctx2d.textAlign = 'center';
    ctx2d.font = 'bold 28px system-ui, sans-serif';
    ctx2d.fillText('Game Over', SCREEN_W / 2, SCREEN_H / 2 - 10);
    ctx2d.font = '14px system-ui, sans-serif';
    ctx2d.fillText('Press R to restart', SCREEN_W / 2, SCREEN_H / 2 + 18);
  }
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx2d.strokeStyle = '#223';
  ctx2d.lineWidth = 2;
  ctx2d.strokeRect(1, 1, SCREEN_W - 2, SCREEN_H - 2);

  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);
  drawShip(ctx2d, state);

  drawHud(ctx2d, state);
}
