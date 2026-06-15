import { describe, expect, it, vi } from 'vitest';

import { drawStatsOverlay } from './draw-stats-overlay';
import { FrameStats } from './frame-stats';

/** Minimal stub recording that the drawer only calls 2D-context methods. */
function mockCtx(): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    canvas: { height: 600, width: 800 },
    fillRect: vi.fn(),
    fillStyle: '',
    fillText: vi.fn(),
    font: '',
    lineTo: vi.fn(),
    lineWidth: 1,
    measureText: vi.fn(() => ({ width: 80 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

describe('drawStatsOverlay', () => {
  it('draws without throwing and balances save/restore', () => {
    const ctx = mockCtx();
    const stats = new FrameStats();
    stats.sample(16);
    stats.sample(20);
    stats.setCounter('enemies', 12);
    drawStatsOverlay(ctx, stats);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('handles an empty collector (no samples)', () => {
    const ctx = mockCtx();
    expect(() => drawStatsOverlay(ctx, new FrameStats())).not.toThrow();
  });

  it('renders the optional logic line when provided', () => {
    const ctx = mockCtx();
    const render = new FrameStats();
    render.sample(16);
    const logic = new FrameStats();
    logic.sample(3);
    drawStatsOverlay(ctx, render, { logic });
    const labels = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0]);
    expect(labels).toContain('logic');
  });
});
