import type { GameState } from './game';

import { Player, PositionDef, SizeDef } from './components';
import { COURT_MARGIN, SCREEN_H, SCREEN_W, WINNING_SCORE } from './game';

const BACKGROUND = '#081119';
const COURT = '#e7edf6';
const LEFT_PADDLE = '#7bdff2';
const RIGHT_PADDLE = '#f7a072';
const BALL = '#f4f7fb';
const MUTED = '#91a4ba';
const OVERLAY = 'rgba(8, 17, 25, 0.82)';

function label(owner: typeof Player.Left | typeof Player.Right): string {
  return owner === Player.Left ? 'Player 1' : 'Player 2';
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.clearRect(0, 0, SCREEN_W, SCREEN_H);

  ctx2d.fillStyle = BACKGROUND;
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx2d.strokeStyle = COURT;
  ctx2d.lineWidth = 3;
  ctx2d.strokeRect(COURT_MARGIN, COURT_MARGIN, SCREEN_W - COURT_MARGIN * 2, SCREEN_H - COURT_MARGIN * 2);

  ctx2d.setLineDash([14, 14]);
  ctx2d.beginPath();
  ctx2d.moveTo(SCREEN_W / 2, COURT_MARGIN);
  ctx2d.lineTo(SCREEN_W / 2, SCREEN_H - COURT_MARGIN);
  ctx2d.stroke();
  ctx2d.setLineDash([]);

  ctx2d.beginPath();
  ctx2d.arc(SCREEN_W / 2, SCREEN_H / 2, 54, 0, Math.PI * 2);
  ctx2d.strokeStyle = 'rgba(231, 237, 246, 0.35)';
  ctx2d.stroke();

  ctx2d.fillStyle = MUTED;
  ctx2d.font = '600 18px Georgia, serif';
  ctx2d.textAlign = 'center';
  ctx2d.fillText(`${label(Player.Left)}  W / S`, SCREEN_W * 0.25, 44);
  ctx2d.fillText(`${label(Player.Right)}  ↑ / ↓`, SCREEN_W * 0.75, 44);

  ctx2d.fillStyle = COURT;
  ctx2d.font = '700 56px Georgia, serif';
  ctx2d.fillText(String(state.scores.left), SCREEN_W * 0.4, 94);
  ctx2d.fillText(String(state.scores.right), SCREEN_W * 0.6, 94);

  const posStore = state.world.getStore(PositionDef);
  const sizeStore = state.world.getStore(SizeDef);

  const leftId = state.paddleIds.left;
  const rightId = state.paddleIds.right;
  const ballId = state.ballId;

  if (leftId != null) {
    const pos = posStore.get(leftId);
    const size = sizeStore.get(leftId);
    if (pos && size) {
      ctx2d.fillStyle = LEFT_PADDLE;
      ctx2d.fillRect(pos.x, pos.y, size.w, size.h);
    }
  }

  if (rightId != null) {
    const pos = posStore.get(rightId);
    const size = sizeStore.get(rightId);
    if (pos && size) {
      ctx2d.fillStyle = RIGHT_PADDLE;
      ctx2d.fillRect(pos.x, pos.y, size.w, size.h);
    }
  }

  if (ballId != null) {
    const pos = posStore.get(ballId);
    const size = sizeStore.get(ballId);
    if (pos && size) {
      ctx2d.fillStyle = BALL;
      ctx2d.fillRect(pos.x, pos.y, size.w, size.h);
    }
  }

  if (!state.winner)
    return;

  ctx2d.fillStyle = OVERLAY;
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  ctx2d.fillStyle = COURT;
  ctx2d.font = '700 42px Georgia, serif';
  ctx2d.fillText(`${label(state.winner)} Wins`, SCREEN_W / 2, SCREEN_H / 2 - 12);
  ctx2d.font = '500 22px Georgia, serif';
  ctx2d.fillText(`First to ${WINNING_SCORE}. Press R to restart.`, SCREEN_W / 2, SCREEN_H / 2 + 28);
}
