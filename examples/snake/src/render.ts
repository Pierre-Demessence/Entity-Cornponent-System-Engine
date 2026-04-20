import type { GameState } from './game';

import { PositionDef } from './components';
import { CANVAS_PX, CELL } from './game';

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  // Play area background (slightly lighter than the page for contrast)
  ctx2d.fillStyle = '#181818';
  ctx2d.fillRect(0, 0, CANVAS_PX, CANVAS_PX);

  const posStore = state.world.getStore(PositionDef);

  if (state.foodId != null) {
    const p = posStore.get(state.foodId)!;
    ctx2d.fillStyle = '#e55';
    ctx2d.fillRect(p.x * CELL + 2, p.y * CELL + 2, CELL - 4, CELL - 4);
  }

  for (let i = 0; i < state.segments.length; i++) {
    const p = posStore.get(state.segments[i]!)!;
    ctx2d.fillStyle = i === 0 ? '#8f8' : '#4c4';
    ctx2d.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);
  }

  // Wall border drawn inside the canvas so its position is pixel-exact
  ctx2d.strokeStyle = '#6af';
  ctx2d.lineWidth = 2;
  ctx2d.strokeRect(1, 1, CANVAS_PX - 2, CANVAS_PX - 2);

  if (state.dead) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
    ctx2d.fillStyle = '#fff';
    ctx2d.font = 'bold 24px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('Game Over', CANVAS_PX / 2, CANVAS_PX / 2 - 10);
    ctx2d.font = '14px system-ui, sans-serif';
    ctx2d.fillText('Press R to restart', CANVAS_PX / 2, CANVAS_PX / 2 + 16);
  }
}
