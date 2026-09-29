import type { Canvas2DRenderContext } from '@pierre/ecs/modules/render-canvas2d';

import type { GameState } from './game';

import { currentFrame, SpriteAnimationDef } from '@pierre/ecs/modules/animation';
import { cameraToView, worldToView } from '@pierre/ecs/modules/camera';
import { easeInOutSine, easeOutBack } from '@pierre/ecs/modules/easing';
import { clamp, clamp01, remap } from '@pierre/ecs/modules/math';
import { Canvas2DRenderer } from '@pierre/ecs/modules/render-canvas2d';

import { CameraDef, LanderDef, PositionDef, VelocityDef } from './components';
import { VIEW_H, VIEW_W } from './game';
import { FUEL_MAX, MAX_LAND_ANGLE, MAX_LAND_VX, MAX_LAND_VY } from './landing';
import { STEP, WORLD_H } from './terrain';

const canvas2d = new Canvas2DRenderer();

const FLAME_LENGTH: Record<string, number> = { 'flame-0': 12, 'flame-1': 18, 'flame-2': 26 };

function drawSky(ctx2d: CanvasRenderingContext2D): void {
  const g = ctx2d.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#02030a');
  g.addColorStop(1, '#0d1226');
  ctx2d.fillStyle = g;
  ctx2d.fillRect(0, 0, VIEW_W, VIEW_H);
}

function drawTerrain(ctx2d: CanvasRenderingContext2D, state: GameState, view: { x: number; y: number; zoom: number }): void {
  const { heights, pads } = state.terrain;
  const z = view.zoom;
  const first = Math.max(0, Math.floor(view.x / STEP) - 1);
  const last = Math.min(heights.length - 1, Math.ceil((view.x + VIEW_W / z) / STEP) + 1);

  ctx2d.beginPath();
  ctx2d.moveTo((first * STEP - view.x) * z, (WORLD_H - view.y) * z);
  for (let i = first; i <= last; i++)
    ctx2d.lineTo((i * STEP - view.x) * z, (heights[i]! - view.y) * z);
  ctx2d.lineTo((last * STEP - view.x) * z, (WORLD_H - view.y) * z);
  ctx2d.closePath();
  ctx2d.fillStyle = '#39404f';
  ctx2d.fill();
  ctx2d.strokeStyle = '#aab3c5';
  ctx2d.lineWidth = 2;
  ctx2d.stroke();

  ctx2d.textAlign = 'center';
  ctx2d.font = `bold ${Math.round(12 * Math.min(z, 1.6))}px system-ui, sans-serif`;
  for (const pad of pads) {
    const x0 = (pad.x - pad.width / 2 - view.x) * z;
    const y0 = (pad.y - view.y) * z;
    ctx2d.fillStyle = '#7CFC9B';
    ctx2d.fillRect(x0, y0 - 3, pad.width * z, 5);
    ctx2d.fillStyle = '#e8ffe9';
    ctx2d.fillText(`x${pad.multiplier}`, (pad.x - view.x) * z, y0 + 18 * z);
  }
}

function drawLander(ctx2d: CanvasRenderingContext2D, state: GameState, view: { x: number; y: number; zoom: number }): void {
  if (state.landerId == null || state.phase === 'crashed')
    return;
  const pos = state.world.getStore(PositionDef).get(state.landerId)!;
  const lander = state.world.getStore(LanderDef).get(state.landerId)!;
  const z = view.zoom;

  ctx2d.save();
  ctx2d.translate((pos.x - view.x) * z, (pos.y - view.y) * z);
  ctx2d.scale(z, z);
  ctx2d.rotate(lander.angle);

  if (lander.thrusting && state.flameId != null) {
    const anim = state.world.getStore(SpriteAnimationDef).get(state.flameId)!;
    const len = FLAME_LENGTH[currentFrame(anim)] ?? 12;
    ctx2d.fillStyle = '#ffb703';
    ctx2d.beginPath();
    ctx2d.moveTo(-5, 9);
    ctx2d.lineTo(0, 9 + len);
    ctx2d.lineTo(5, 9);
    ctx2d.closePath();
    ctx2d.fill();
  }

  ctx2d.fillStyle = '#e0e4ec';
  ctx2d.strokeStyle = '#8a92a3';
  ctx2d.lineWidth = 1.5;
  ctx2d.beginPath();
  ctx2d.arc(0, -3, 9, Math.PI, 0);
  ctx2d.lineTo(9, 6);
  ctx2d.lineTo(-9, 6);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.stroke();
  ctx2d.strokeStyle = '#e0e4ec';
  ctx2d.beginPath();
  ctx2d.moveTo(-7, 6);
  ctx2d.lineTo(-14, 14);
  ctx2d.moveTo(7, 6);
  ctx2d.lineTo(14, 14);
  ctx2d.stroke();
  ctx2d.restore();
}

/** Edge arrows for pads outside the view, pulsing gently; the world→view transform places them. */
function drawPadMarkers(ctx2d: CanvasRenderingContext2D, state: GameState, cam: Parameters<typeof worldToView>[2]): void {
  const pulse = 0.55 + 0.45 * easeInOutSine(0.5 + 0.5 * Math.sin(performance.now() / 350));
  ctx2d.font = 'bold 12px system-ui, sans-serif';
  ctx2d.textAlign = 'center';
  for (const pad of state.terrain.pads) {
    const { vx } = worldToView(pad.x, pad.y, cam);
    if (vx >= 0 && vx <= VIEW_W)
      continue;
    const left = vx < 0;
    const x = left ? 18 : VIEW_W - 18;
    ctx2d.globalAlpha = pulse;
    ctx2d.fillStyle = '#7CFC9B';
    ctx2d.fillText(`${left ? '◀' : '▶'} x${pad.multiplier}`, x + (left ? 14 : -14), VIEW_H - 70 - pad.multiplier * 14);
    ctx2d.globalAlpha = 1;
  }
}

function drawGauge(ctx2d: CanvasRenderingContext2D, label: string, x: number, y: number, ok: boolean): void {
  ctx2d.textAlign = 'left';
  ctx2d.fillStyle = ok ? '#7CFC9B' : '#ff7b72';
  ctx2d.fillText(label, x, y);
}

function drawHud(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  if (state.landerId == null)
    return;
  const lander = state.world.getStore(LanderDef).get(state.landerId)!;
  const vel = state.world.getStore(VelocityDef).get(state.landerId)!;

  ctx2d.font = '14px ui-monospace, monospace';
  drawGauge(ctx2d, `Vy ${vel.vy.toFixed(0).padStart(4)}`, 14, 24, vel.vy <= MAX_LAND_VY);
  drawGauge(ctx2d, `Vx ${vel.vx.toFixed(0).padStart(4)}`, 14, 44, Math.abs(vel.vx) <= MAX_LAND_VX);
  drawGauge(ctx2d, `Ang ${(lander.angle * 57.2958).toFixed(0).padStart(3)}°`, 14, 64, Math.abs(lander.angle) <= MAX_LAND_ANGLE);

  ctx2d.textAlign = 'right';
  ctx2d.fillStyle = '#e8ecf5';
  ctx2d.fillText(`Score ${state.score}`, VIEW_W - 14, 24);
  ctx2d.fillText(`Landings ${state.landings}`, VIEW_W - 14, 44);
  ctx2d.fillText(`Level ${state.seed}`, VIEW_W - 14, 64);

  // Fuel bar; it flashes when the tank is nearly dry.
  const frac = clamp01(remap(lander.fuel, 0, FUEL_MAX, 0, 1));
  const low = frac < 0.2;
  const flash = low ? 0.5 + 0.5 * easeInOutSine(0.5 + 0.5 * Math.sin(performance.now() / 120)) : 1;
  ctx2d.strokeStyle = '#8a92a3';
  ctx2d.strokeRect(VIEW_W / 2 - 100, 14, 200, 12);
  ctx2d.globalAlpha = flash;
  ctx2d.fillStyle = low ? '#ff7b72' : '#ffd23f';
  ctx2d.fillRect(VIEW_W / 2 - 100, 14, 200 * frac, 12);
  ctx2d.globalAlpha = 1;
  ctx2d.textAlign = 'center';
  ctx2d.fillStyle = '#e8ecf5';
  ctx2d.fillText('FUEL', VIEW_W / 2, 44);

  if (state.phase === 'flying' && state.landings === 0 && state.score === 0) {
    ctx2d.fillStyle = '#9fb';
    ctx2d.font = '13px system-ui, sans-serif';
    ctx2d.fillText('↑ / W / Space thrust  ·  ← → / A D rotate  ·  land upright and slow on a green pad', VIEW_W / 2, VIEW_H - 16);
  }
}

function drawBanner(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  if (!state.message)
    return;
  // A springy pop-in on the first 350ms.
  const pop = easeOutBack(clamp(state.message.ageMs / 350, 0, 1));
  const crashed = state.phase === 'crashed';
  ctx2d.save();
  ctx2d.translate(VIEW_W / 2, VIEW_H / 2 - 40);
  ctx2d.scale(pop, pop);
  ctx2d.textAlign = 'center';
  ctx2d.font = 'bold 30px system-ui, sans-serif';
  ctx2d.fillStyle = crashed ? '#ff7b72' : '#7CFC9B';
  ctx2d.fillText(state.message.text, 0, 0);
  ctx2d.font = '15px system-ui, sans-serif';
  ctx2d.fillStyle = '#e8ecf5';
  ctx2d.fillText(crashed ? 'Enter / R — new run' : 'Enter / R — next landing site', 0, 30);
  if (crashed) {
    ctx2d.fillText(`Run score ${state.score}`, 0, 56);
    state.runs.forEach((run, i) => {
      ctx2d.fillText(`${i + 1}.  ${run.score}  (${run.landings} landings)`, 0, 90 + i * 20);
    });
  }
  ctx2d.restore();
}

export function render(ctx2d: CanvasRenderingContext2D, state: GameState): void {
  drawSky(ctx2d);
  if (state.cameraId == null)
    return;
  const cam = state.world.getStore(CameraDef).get(state.cameraId)!;
  const view = cameraToView(cam);

  drawTerrain(ctx2d, state, view);
  drawLander(ctx2d, state, view);
  const renderCtx: Canvas2DRenderContext = { ctx2d, view, world: state.world };
  canvas2d.render(renderCtx);
  drawPadMarkers(ctx2d, state, cam);
  drawHud(ctx2d, state);
  drawBanner(ctx2d, state);
}
