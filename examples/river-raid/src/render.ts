import type { GameState } from './game';

import {
  BridgeDef,
  BridgeTag,
  BulletTag,
  EnemyDef,
  EnemyTag,
  FuelDepotTag,
  PositionDef,
  SizeDef,
} from './components';
import {
  BRIDGE_H,
  BRIDGE_W,
  BULLET_H,
  BULLET_W,
  DEPOT_H,
  DEPOT_W,
  JET_H,
  JET_W,
  SCREEN_H,
  SCREEN_W,
} from './game';

/** Water colour for the river. */
const WATER = '#1a3a6e';
const WATER_LIGHT = '#2858a8';
const BANK_FILL = '#2d5a1e';
const BANK_STROKE = '#1a3a12';

/** Draw the terrain: river water and banks for each segment. */
function drawTerrain(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  const { scrollOffset, segments } = state;

  if (segments.length === 0)
    return;

  // Draw water background covering the full screen
  ctx2d.fillStyle = WATER;
  ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Draw banks over the water
  for (const seg of segments) {
    const sy = SCREEN_H + scrollOffset - seg.y;
    if (sy < -40 || sy > SCREEN_H)
      continue;

    // Left bank
    if (seg.leftX > 0) {
      ctx2d.fillStyle = BANK_FILL;
      ctx2d.fillRect(0, sy, seg.leftX, 42); // slight overlap to avoid seams
      ctx2d.strokeStyle = BANK_STROKE;
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(0, sy, seg.leftX, 42);
    }

    // Right bank
    if (seg.rightX < SCREEN_W) {
      ctx2d.fillStyle = BANK_FILL;
      ctx2d.fillRect(seg.rightX, sy, SCREEN_W - seg.rightX, 42);
      ctx2d.strokeStyle = BANK_STROKE;
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(seg.rightX, sy, SCREEN_W - seg.rightX, 42);
    }

    // River edge highlight (subtle)
    ctx2d.strokeStyle = WATER_LIGHT;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(seg.leftX, sy);
    ctx2d.lineTo(seg.leftX, sy + 40);
    ctx2d.moveTo(seg.rightX, sy);
    ctx2d.lineTo(seg.rightX, sy + 40);
    ctx2d.stroke();
  }
}

/** Draw the player jet as a simple triangle/arrow shape. */
function drawPlayer(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  if (state.playerId == null)
    return;
  const pos = state.world.getStore(PositionDef).get(state.playerId);
  if (!pos)
    return;

  const x = pos.x;
  const y = SCREEN_H + state.scrollOffset - pos.y; // world Y → screen Y
  const cx = x + JET_W / 2;

  // Jet body
  ctx2d.fillStyle = '#44AAFF';
  ctx2d.strokeStyle = '#2266CC';
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  // Nose (top point)
  ctx2d.moveTo(cx, y);
  // Right wing
  ctx2d.lineTo(x + JET_W, y + JET_H * 0.7);
  // Right tail
  ctx2d.lineTo(x + JET_W * 0.7, y + JET_H);
  // Bottom centre
  ctx2d.lineTo(cx, y + JET_H * 0.75);
  // Left tail
  ctx2d.lineTo(x + JET_W * 0.3, y + JET_H);
  // Left wing
  ctx2d.lineTo(x, y + JET_H * 0.7);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.stroke();

  // Cockpit
  ctx2d.fillStyle = '#88CCFF';
  ctx2d.beginPath();
  ctx2d.ellipse(cx, y + JET_H * 0.35, 5, 7, 0, 0, Math.PI * 2);
  ctx2d.fill();

  // Engine flame
  if (!state.dying) {
    const flameLen = 8 + Math.random() * 6;
    ctx2d.fillStyle = '#FF6644';
    ctx2d.beginPath();
    ctx2d.moveTo(cx - 3, y + JET_H * 0.75);
    ctx2d.lineTo(cx, y + JET_H * 0.75 + flameLen);
    ctx2d.lineTo(cx + 3, y + JET_H * 0.75);
    ctx2d.closePath();
    ctx2d.fill();
  }
}

/** Draw a simple enemy shape based on kind. */
function drawEnemy(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  for (const id of state.world.getTag(EnemyTag)) {
    const pos = state.world.getStore(PositionDef).get(id);
    const size = state.world.getStore(SizeDef).get(id);
    const enemy = state.world.getStore(EnemyDef).get(id);
    if (!pos || !size || !enemy)
      continue;

    const sy = SCREEN_H + state.scrollOffset - pos.y;

    ctx2d.save();
    if (enemy.dir === -1)
      ctx2d.scale(-1, 1);

    if (enemy.kind === 'boat') {
      ctx2d.fillStyle = '#CC6633';
      ctx2d.strokeStyle = '#000';
      ctx2d.lineWidth = 1;
      const bx = enemy.dir === 1 ? pos.x : -(pos.x + size.w);
      const by = sy;
      // Hull
      ctx2d.beginPath();
      ctx2d.moveTo(bx + size.w * 0.1, by + size.h);
      ctx2d.lineTo(bx + size.w * 0.2, by);
      ctx2d.lineTo(bx + size.w * 0.8, by);
      ctx2d.lineTo(bx + size.w * 0.9, by + size.h);
      ctx2d.closePath();
      ctx2d.fill();
      ctx2d.stroke();
    }
    else if (enemy.kind === 'helicopter') {
      // Body
      ctx2d.fillStyle = '#FF8844';
      ctx2d.fillRect(enemy.dir === 1 ? pos.x : -(pos.x + size.w), sy + size.h * 0.3, size.w, size.h * 0.4);
      // Rotor
      ctx2d.strokeStyle = '#AAA';
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      const rx = enemy.dir === 1 ? pos.x + size.w / 2 : -(pos.x + size.w / 2);
      ctx2d.moveTo(rx - size.w * 0.6, sy + size.h * 0.3);
      ctx2d.lineTo(rx + size.w * 0.6, sy + size.h * 0.3);
      ctx2d.stroke();
      // Tail
      ctx2d.fillStyle = '#FF8844';
      ctx2d.fillRect(enemy.dir === 1 ? pos.x + size.w : -(pos.x), sy + size.h * 0.4, size.w * 0.4, size.h * 0.15);
    }
    else {
      // Jet
      ctx2d.fillStyle = '#FF4444';
      ctx2d.strokeStyle = '#000';
      ctx2d.lineWidth = 1;
      const jx = enemy.dir === 1 ? pos.x : -(pos.x + size.w);
      ctx2d.beginPath();
      ctx2d.moveTo(jx + size.w, sy + size.h / 2);
      ctx2d.lineTo(jx, sy);
      ctx2d.lineTo(jx, sy + size.h);
      ctx2d.closePath();
      ctx2d.fill();
      ctx2d.stroke();
    }
    ctx2d.restore();
  }
}

/** Draw bullets. */
function drawBullets(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.fillStyle = '#FFFF44';
  for (const id of state.world.getTag(BulletTag)) {
    const pos = state.world.getStore(PositionDef).get(id);
    if (!pos)
      continue;
    const sy = SCREEN_H + state.scrollOffset - pos.y;
    ctx2d.fillRect(pos.x, sy, BULLET_W, BULLET_H);
  }
}

/** Draw fuel depots. */
function drawDepots(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  for (const id of state.world.getTag(FuelDepotTag)) {
    const pos = state.world.getStore(PositionDef).get(id);
    if (!pos)
      continue;
    const sy = SCREEN_H + state.scrollOffset - pos.y;
    // Depot as a small tank
    ctx2d.fillStyle = '#FFD700';
    ctx2d.strokeStyle = '#B8960F';
    ctx2d.lineWidth = 1;
    ctx2d.fillRect(pos.x, sy, DEPOT_W, DEPOT_H);
    ctx2d.strokeRect(pos.x, sy, DEPOT_W, DEPOT_H);
    // "F" label
    ctx2d.fillStyle = '#000';
    ctx2d.font = 'bold 12px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('F', pos.x + DEPOT_W / 2, sy + DEPOT_H - 5);
  }
}

/** Draw bridges. */
function drawBridges(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  for (const id of state.world.getTag(BridgeTag)) {
    const pos = state.world.getStore(PositionDef).get(id);
    const br = state.world.getStore(BridgeDef).get(id);
    if (!pos || !br)
      continue;
    const sy = SCREEN_H + state.scrollOffset - pos.y;

    // Bridge pillars
    ctx2d.fillStyle = '#5C4A0E';
    ctx2d.fillRect(pos.x + 4, sy, 8, BRIDGE_H);
    ctx2d.fillRect(pos.x + BRIDGE_W - 12, sy, 8, BRIDGE_H);

    // Bridge deck
    ctx2d.fillStyle = br.hp > 1 ? '#8B6914' : '#AA3333';
    ctx2d.fillRect(pos.x, sy, BRIDGE_W, 8);
    ctx2d.strokeStyle = '#000';
    ctx2d.lineWidth = 1;
    ctx2d.strokeRect(pos.x, sy, BRIDGE_W, 8);

    // HP indicator
    if (br.hp < 3) {
      ctx2d.fillStyle = '#FF0000';
      for (let i = 0; i < 3 - br.hp; i++) {
        ctx2d.fillRect(pos.x + BRIDGE_W / 2 - 12 + i * 10, sy + 12, 6, 4);
      }
    }
  }
}

/** Draw UI overlay: score, lives, fuel gauge. */
function drawUI(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  // Background bar
  ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
  ctx2d.fillRect(0, 0, SCREEN_W, 32);

  ctx2d.fillStyle = '#FFF';
  ctx2d.font = 'bold 14px system-ui';
  ctx2d.textAlign = 'left';
  ctx2d.fillText(`Score: ${state.score}`, 10, 22);

  ctx2d.textAlign = 'center';
  ctx2d.fillText(`Level ${state.level}`, SCREEN_W / 2, 22);

  // Lives
  ctx2d.textAlign = 'right';
  ctx2d.fillText(`Lives: ${state.lives}`, SCREEN_W - 10, 22);

  // Fuel gauge (below the bar)
  const fuelBarW = SCREEN_W - 20;
  const fuelBarH = 8;
  const fuelBarX = 10;
  const fuelBarY = 36;
  const fuelPct = Math.max(0, state.fuel / 100);

  ctx2d.fillStyle = '#333';
  ctx2d.fillRect(fuelBarX, fuelBarY, fuelBarW, fuelBarH);

  const fuelColor = fuelPct > 0.3 ? '#44CC44' : fuelPct > 0.15 ? '#CCAA44' : '#CC4444';
  ctx2d.fillStyle = fuelColor;
  ctx2d.fillRect(fuelBarX, fuelBarY, fuelBarW * fuelPct, fuelBarH);

  ctx2d.strokeStyle = '#666';
  ctx2d.lineWidth = 1;
  ctx2d.strokeRect(fuelBarX, fuelBarY, fuelBarW, fuelBarH);

  ctx2d.fillStyle = '#FFF';
  ctx2d.font = '10px system-ui';
  ctx2d.textAlign = 'center';
  ctx2d.fillText('FUEL', SCREEN_W / 2, fuelBarY + fuelBarH - 1);
}

/** Draw death / game over overlay. */
function drawOverlay(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  if (state.dying) {
    ctx2d.fillStyle = 'rgba(255,0,0,0.25)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.fillStyle = '#FFF';
    ctx2d.font = 'bold 28px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('DESTROYED', SCREEN_W / 2, SCREEN_H / 2);
  }
  else if (state.gameOver) {
    ctx2d.fillStyle = 'rgba(0,0,0,0.6)';
    ctx2d.fillRect(0, 0, SCREEN_W, SCREEN_H);
    ctx2d.fillStyle = '#FFF';
    ctx2d.font = 'bold 32px system-ui';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('GAME OVER', SCREEN_W / 2, SCREEN_H / 2 - 20);
    ctx2d.font = '18px system-ui';
    ctx2d.fillText(`Score: ${state.score}`, SCREEN_W / 2, SCREEN_H / 2 + 20);
    ctx2d.fillText(`Best: ${state.best}`, SCREEN_W / 2, SCREEN_H / 2 + 46);
    ctx2d.font = '14px system-ui';
    ctx2d.fillStyle = '#AAA';
    ctx2d.fillText('Press R to restart', SCREEN_W / 2, SCREEN_H / 2 + 80);
  }
}

/** Main render entry point. */
export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  ctx2d.clearRect(0, 0, SCREEN_W, SCREEN_H);
  drawTerrain(ctx2d, state);
  drawBridges(ctx2d, state);
  drawDepots(ctx2d, state);
  drawEnemy(ctx2d, state);
  drawBullets(ctx2d, state);
  drawPlayer(ctx2d, state);
  drawUI(ctx2d, state);
  drawOverlay(ctx2d, state);
}
