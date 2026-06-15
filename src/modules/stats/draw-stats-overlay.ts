import type { FrameStats } from './frame-stats';

/** Visual configuration for {@link drawStatsOverlay}. */
export interface StatsOverlayOptions {
  /** Monospace font for the readout (default '11px ui-monospace, monospace'). */
  font?: string;
  /** Sparkline height in pixels (default 32). */
  graphHeight?: number;
  /** Sparkline width in pixels (default 120). */
  graphWidth?: number;
  /** Optional second collector (e.g. logic-tick ms) shown as a "logic" ms line. */
  logic?: FrameStats;
  /** Frame-time target (ms) for the sparkline threshold line (default 16.6 ≈ 60fps). */
  targetMs?: number;
  /** Top-left x of the panel in screen pixels (default 8). */
  x?: number;
  /** Top-left y of the panel in screen pixels (default 8). */
  y?: number;
}

const PAD = 6;
const LINE_H = 14;
const COLOR_BG = 'rgba(8, 12, 24, 0.72)';
const COLOR_TEXT = '#7fffd4';
const COLOR_DIM = '#9fd0ff';
const COLOR_GOOD = '#5effa0';
const COLOR_BAD = '#ff7a6b';
const COLOR_LINE = 'rgba(255, 255, 255, 0.25)';

/**
 * Draws a stats.js-style overlay (numeric readout + frame-time sparkline)
 * for `render` into `ctx2d`, in screen-pixel space. Self-contained — saves
 * and restores all context state it touches and assumes no camera transform
 * (call it after any `ctx2d.restore()` of the world transform).
 *
 * Renders, per line: fps (cur/avg) + ms (cur/avg/min/max), the 1% / 0.1%
 * lows, an optional logic-ms line, JS heap when `performance.memory` is
 * available (Chrome only — silently omitted elsewhere), any named counters,
 * then the sparkline with a threshold line at `targetMs`.
 */
export function drawStatsOverlay(
  ctx2d: CanvasRenderingContext2D,
  render: FrameStats,
  options: StatsOverlayOptions = {},
): void {
  const x = options.x ?? 8;
  const y = options.y ?? 8;
  const targetMs = options.targetMs ?? 16.6;
  const font = options.font ?? '11px ui-monospace, monospace';
  const gw = options.graphWidth ?? 120;
  const gh = options.graphHeight ?? 32;

  const lines: [string, string][] = [
    ['fps', `${Math.round(render.fps)} (avg ${Math.round(render.avgFps)})`],
    ['ms', `${render.ms.toFixed(1)} a${render.avgMs.toFixed(1)} ${render.minMs.toFixed(1)}-${render.maxMs.toFixed(1)}`],
    ['low', `1% ${Math.round(render.low1Fps)}  0.1% ${Math.round(render.low01Fps)}`],
  ];
  if (options.logic)
    lines.push(['logic', `${options.logic.ms.toFixed(2)}ms a${options.logic.avgMs.toFixed(2)}`]);
  const heap = readHeapMb();
  if (heap !== null)
    lines.push(['heap', `${heap.used} / ${heap.total} MB`]);
  for (const [label, value] of render.counters)
    lines.push([label, String(value)]);

  ctx2d.save();
  ctx2d.font = font;
  ctx2d.textBaseline = 'alphabetic';

  // Panel width: widest "label value" row vs the graph.
  let textW = 0;
  for (const [label, value] of lines)
    textW = Math.max(textW, ctx2d.measureText(`${label}  ${value}`).width);
  const panelW = Math.max(textW, gw) + PAD * 2;
  const panelH = lines.length * LINE_H + gh + PAD * 3;

  ctx2d.fillStyle = COLOR_BG;
  ctx2d.fillRect(x, y, panelW, panelH);

  let ty = y + PAD + LINE_H - 3;
  for (const [label, value] of lines) {
    ctx2d.fillStyle = COLOR_DIM;
    ctx2d.textAlign = 'left';
    ctx2d.fillText(label, x + PAD, ty);
    ctx2d.fillStyle = COLOR_TEXT;
    ctx2d.textAlign = 'right';
    ctx2d.fillText(value, x + panelW - PAD, ty);
    ty += LINE_H;
  }

  drawSparkline(ctx2d, x + PAD, ty - LINE_H + PAD, gw, gh, render.history, targetMs);
  ctx2d.restore();
}

function drawSparkline(
  ctx2d: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  w: number,
  h: number,
  history: readonly number[],
  targetMs: number,
): void {
  // Scale so the worst recent frame (or 2× the target, whichever larger)
  // fills the height — keeps the target line near the lower third.
  let peak = targetMs * 2;
  for (const ms of history)
    peak = Math.max(peak, ms);

  ctx2d.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx2d.fillRect(gx, gy, w, h);

  const n = history.length;
  if (n > 0) {
    const barW = w / n;
    for (let i = 0; i < n; i++) {
      const ms = history[i]!;
      const bh = Math.min(h, (ms / peak) * h);
      ctx2d.fillStyle = ms > targetMs ? COLOR_BAD : COLOR_GOOD;
      ctx2d.fillRect(gx + i * barW, gy + h - bh, Math.max(1, barW - 0.5), bh);
    }
  }

  // Threshold line at targetMs.
  const ly = gy + h - Math.min(h, (targetMs / peak) * h);
  ctx2d.strokeStyle = COLOR_LINE;
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(gx, ly + 0.5);
  ctx2d.lineTo(gx + w, ly + 0.5);
  ctx2d.stroke();
}

interface PerformanceWithMemory {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number };
}

/** JS heap usage in whole MB, or null when `performance.memory` is unavailable (non-Chrome). */
function readHeapMb(): { used: number; total: number } | null {
  const mem = (typeof performance !== 'undefined' ? (performance as PerformanceWithMemory).memory : undefined);
  if (!mem)
    return null;
  const mb = (bytes: number): number => Math.round(bytes / (1024 * 1024));
  return { total: mb(mem.totalJSHeapSize), used: mb(mem.usedJSHeapSize) };
}
