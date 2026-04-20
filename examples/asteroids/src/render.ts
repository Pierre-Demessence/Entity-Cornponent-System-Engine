import type { GameState } from './game';

import {
  BulletTag,
  PositionDef,
  RadiusDef,
  RockTag,
  RotationDef,
  ShipTag,
} from './components';
import { SCREEN_H, SCREEN_W } from './game';

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#000';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Play-area border
  ctx2d.strokeStyle = '#223';
  ctx2d.lineWidth = 2;
  ctx2d.strokeRect(1, 1, SCREEN_W - 2, SCREEN_H - 2);

  const posStore = state.world.getStore(PositionDef);
  const radStore = state.world.getStore(RadiusDef);

  // Rocks
  ctx2d.strokeStyle = '#9a9';
  ctx2d.lineWidth = 1.5;
  for (const id of state.world.getTag(RockTag)) {
    const p = posStore.get(id)!;
    const r = radStore.get(id)!.r;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx2d.stroke();
  }

  // Bullets
  ctx2d.fillStyle = '#fe6';
  for (const id of state.world.getTag(BulletTag)) {
    const p = posStore.get(id)!;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx2d.fill();
  }

  // Ship
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
    if (state.input.thrust) {
      ctx2d.strokeStyle = '#fa4';
      ctx2d.beginPath();
      ctx2d.moveTo(-r * 0.4, r * 0.35);
      ctx2d.lineTo(-r * 1.1, 0);
      ctx2d.lineTo(-r * 0.4, -r * 0.35);
      ctx2d.stroke();
    }
    ctx2d.restore();
  }

  // HUD
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
