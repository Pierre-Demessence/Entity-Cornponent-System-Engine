import type { GameState } from './game';

import { TILE } from './game';
import { COLS, isDoor, isWall, ROWS } from './maze';

const INSET = 3;

function open(c: number, r: number): boolean {
  return c < 0 || c >= COLS || r < 0 || r >= ROWS || !isWall(c, r);
}

/** Draws the walls once, as outlines along every edge where a wall meets open floor or the screen border. */
export function bakeMaze(doc: Document, color: string): HTMLCanvasElement {
  const canvas = doc.createElement('canvas');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isWall(c, r))
        continue;
      const x = c * TILE;
      const y = r * TILE;
      if (open(c, r - 1)) {
        ctx.moveTo(x, y + INSET);
        ctx.lineTo(x + TILE, y + INSET);
      }
      if (open(c, r + 1)) {
        ctx.moveTo(x, y + TILE - INSET);
        ctx.lineTo(x + TILE, y + TILE - INSET);
      }
      if (open(c - 1, r)) {
        ctx.moveTo(x + INSET, y);
        ctx.lineTo(x + INSET, y + TILE);
      }
      if (open(c + 1, r)) {
        ctx.moveTo(x + TILE - INSET, y);
        ctx.lineTo(x + TILE - INSET, y + TILE);
      }
    }
  }
  ctx.stroke();
  ctx.fillStyle = '#ffb8ff';
  for (let c = 0; c < COLS; c++) {
    if (isDoor(c, 12))
      ctx.fillRect(c * TILE, 12 * TILE + TILE / 2 - 2, TILE, 4);
  }
  return canvas;
}

/** Whether the cleared maze is in the white half of its blink. */
export function mazeFlashing(g: GameState): boolean {
  return g.phase.current === 'clear' && Math.floor(g.phase.elapsedMs / 250) % 2 === 1;
}
