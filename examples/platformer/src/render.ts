import type { GameState } from './game';

import {
  AabbDef,
  CoinTag,
  PlayerTag,
  PositionDef,
  StaticBodyTag,
} from './components';
import { SCREEN_H, SCREEN_W } from './game';

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  // Sky
  ctx2d.fillStyle = '#1a1d28';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  const posStore = state.world.getStore(PositionDef);
  const aabbStore = state.world.getStore(AabbDef);

  // Platforms
  ctx2d.fillStyle = '#5a6577';
  ctx2d.strokeStyle = '#8aa0bd';
  ctx2d.lineWidth = 1;
  for (const id of state.world.getTag(StaticBodyTag)) {
    const p = posStore.get(id)!;
    const a = aabbStore.get(id)!;
    ctx2d.fillRect(p.x, p.y, a.w, a.h);
    ctx2d.strokeRect(p.x + 0.5, p.y + 0.5, a.w - 1, a.h - 1);
  }

  // Coins
  ctx2d.fillStyle = '#f4c542';
  for (const id of state.world.getTag(CoinTag)) {
    const p = posStore.get(id)!;
    const a = aabbStore.get(id)!;
    ctx2d.beginPath();
    ctx2d.arc(p.x + a.w / 2, p.y + a.h / 2, a.w / 2, 0, Math.PI * 2);
    ctx2d.fill();
  }

  // Player
  ctx2d.fillStyle = '#58c4ff';
  for (const id of state.world.getTag(PlayerTag)) {
    const p = posStore.get(id)!;
    const a = aabbStore.get(id)!;
    ctx2d.fillRect(p.x, p.y, a.w, a.h);
  }

  // HUD
  ctx2d.fillStyle = '#fff';
  ctx2d.font = '16px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`Score: ${state.score}`, 12, 22);
}
