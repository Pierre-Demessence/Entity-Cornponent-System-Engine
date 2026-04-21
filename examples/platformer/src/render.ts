import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import {
  AabbDef,
  CoinTag,
  PositionDef,
} from './components';
import { SCREEN_H, SCREEN_W } from './game';

const canvas2d = new Canvas2DRenderer();

/**
 * Coins are drawn bespoke: their `Position` is the top-left of the
 * AABB (shared with physics), but they render as circles centred on
 * the AABB. `RenderableDef`'s circle kind uses centre-anchored
 * positions, so a data-driven migration would require splitting their
 * position semantics. Keep bespoke for v1.
 */
function drawCoins(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const posStore = state.world.getStore(PositionDef);
  const aabbStore = state.world.getStore(AabbDef);
  ctx2d.fillStyle = '#f4c542';
  for (const id of state.world.getTag(CoinTag)) {
    const p = posStore.get(id)!;
    const a = aabbStore.get(id)!;
    ctx2d.beginPath();
    ctx2d.arc(p.x + a.w / 2, p.y + a.h / 2, a.w / 2, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#fff';
  ctx2d.font = '16px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`Score: ${state.score}`, 12, 22);
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  // Sky
  ctx2d.fillStyle = '#1a1d28';
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Entity layer: platforms + player via RenderableDef; coins stay bespoke.
  const renderCtx: Canvas2DRenderContext = { ctx2d, world: state.world };
  canvas2d.render(renderCtx);
  drawCoins(ctx2d, state);

  // Overlay layer
  drawHud(ctx2d, state);
}
