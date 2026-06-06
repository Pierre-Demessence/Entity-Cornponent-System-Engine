import type { SpriteFrameSource } from './canvas2d-renderer';

import { beforeEach, describe, expect, it } from 'vitest';

import { EcsWorld } from '#world';

import { PositionDef, RotationDef, ScaleDef } from '../transform';
import { Canvas2DRenderer } from './canvas2d-renderer';
import { OpacityDef } from './opacity';
import { RenderOrderDef } from './render-order';
import { RenderableDef } from './renderable';

type Call
  = | { op: 'fillRect'; x: number; y: number; w: number; h: number; fillStyle: string }
    | { op: 'strokeRect'; x: number; y: number; w: number; h: number; strokeStyle: string; lineWidth: number }
    | { op: 'arcFill'; x: number; y: number; r: number; fillStyle: string }
    | { op: 'arcStroke'; x: number; y: number; r: number; strokeStyle: string; lineWidth: number }
    | { op: 'polyFill'; pts: readonly [number, number][]; closed: boolean; fillStyle: string }
    | { op: 'polyStroke'; pts: readonly [number, number][]; closed: boolean; strokeStyle: string; lineWidth: number }
    | { op: 'fillText'; text: string; x: number; y: number; font: string; fillStyle: string; align: string; baseline: string }
    | { op: 'strokeText'; text: string; x: number; y: number; font: string; strokeStyle: string; lineWidth: number }
    | { op: 'drawImage'; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }
    | { op: 'save' }
    | { op: 'restore' }
    | { op: 'setAlpha'; value: number }
    | { op: 'setBlend'; value: string }
    | { op: 'transform'; a: number; b: number; c: number; d: number; e: number; f: number };

interface Recorder { calls: Call[]; ctx2d: CanvasRenderingContext2D }

function makeRecorder(): Recorder {
  const calls: Call[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  let lineWidth = 1;
  let globalAlpha = 1;
  let globalCompositeOperation = 'source-over';
  let font = '10px sans-serif';
  let textAlign: CanvasTextAlign = 'start';
  let textBaseline: CanvasTextBaseline = 'alphabetic';

  // Affine transform stack (column-major): [a, b, c, d, e, f] is the
  // matrix [[a,c,e],[b,d,f]] mapping local (x,y) -> (a*x + c*y + e, b*x + d*y + f).
  let mat: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  const matStack: (typeof mat)[] = [];
  const stateStack: {
    fillStyle: string;
    strokeStyle: string;
    lineWidth: number;
    globalAlpha: number;
    globalCompositeOperation: string;
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
  }[] = [];

  let pendingArc: { x: number; y: number; r: number } | null = null;
  let pendingPath: [number, number][] | null = null;
  let pendingPathClosed = false;

  function applyMat(lx: number, ly: number): [number, number] {
    return [mat[0] * lx + mat[2] * ly + mat[4], mat[1] * lx + mat[3] * ly + mat[5]];
  }

  const ctx = {
    canvas: { height: 600, width: 800 } as HTMLCanvasElement,
    closePath(): void { pendingPathClosed = true; },
    get fillStyle(): string { return fillStyle; },
    set fillStyle(v: string) { fillStyle = v; },
    get font(): string { return font; },
    set font(v: string) { font = v; },
    get globalAlpha(): number { return globalAlpha; },
    get globalCompositeOperation(): string { return globalCompositeOperation; },
    get lineWidth(): number { return lineWidth; },
    set lineWidth(v: number) { lineWidth = v; },
    get strokeStyle(): string { return strokeStyle; },
    set strokeStyle(v: string) { strokeStyle = v; },
    get textAlign(): CanvasTextAlign { return textAlign; },
    set textAlign(v: CanvasTextAlign) { textAlign = v; },
    get textBaseline(): CanvasTextBaseline { return textBaseline; },
    set textBaseline(v: CanvasTextBaseline) { textBaseline = v; },
    arc(x: number, y: number, r: number): void {
      const [gx, gy] = applyMat(x, y);
      pendingArc = { r, x: gx, y: gy };
    },
    beginPath(): void {
      pendingArc = null;
      pendingPath = null;
      pendingPathClosed = false;
    },
    drawImage(
      _image: CanvasImageSource,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ): void {
      const [gx, gy] = applyMat(dx, dy);
      calls.push({ dh, dw, dx: gx, dy: gy, op: 'drawImage', sh, sw, sx, sy });
    },
    fill(): void {
      if (pendingArc)
        calls.push({ op: 'arcFill', ...pendingArc, fillStyle });
      else if (pendingPath)
        calls.push({ closed: pendingPathClosed, fillStyle, op: 'polyFill', pts: pendingPath });
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      const [gx, gy] = applyMat(x, y);
      calls.push({ fillStyle, h, op: 'fillRect', w, x: gx, y: gy });
    },
    fillText(text: string, x: number, y: number): void {
      const [gx, gy] = applyMat(x, y);
      calls.push({ align: textAlign, baseline: textBaseline, fillStyle, font, op: 'fillText', text, x: gx, y: gy });
    },
    set globalAlpha(v: number) {
      globalAlpha = v;
      calls.push({ op: 'setAlpha', value: v });
    },
    set globalCompositeOperation(v: string) {
      globalCompositeOperation = v;
      calls.push({ op: 'setBlend', value: v });
    },
    lineTo(x: number, y: number): void {
      if (pendingPath)
        pendingPath.push(applyMat(x, y));
    },
    moveTo(x: number, y: number): void {
      pendingPath = [applyMat(x, y)];
    },
    restore(): void {
      calls.push({ op: 'restore' });
      const m = matStack.pop();
      if (m)
        mat = m;
      const s = stateStack.pop();
      if (s) {
        fillStyle = s.fillStyle;
        strokeStyle = s.strokeStyle;
        lineWidth = s.lineWidth;
        globalAlpha = s.globalAlpha;
        globalCompositeOperation = s.globalCompositeOperation;
        font = s.font;
        textAlign = s.textAlign;
        textBaseline = s.textBaseline;
      }
    },
    rotate(a: number): void {
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      mat = [
        mat[0] * cos + mat[2] * sin,
        mat[1] * cos + mat[3] * sin,
        mat[0] * -sin + mat[2] * cos,
        mat[1] * -sin + mat[3] * cos,
        mat[4],
        mat[5],
      ];
      calls.push({ a: mat[0], b: mat[1], c: mat[2], d: mat[3], e: mat[4], f: mat[5], op: 'transform' });
    },
    save(): void {
      calls.push({ op: 'save' });
      matStack.push([...mat]);
      stateStack.push({
        fillStyle,
        font,
        globalAlpha,
        globalCompositeOperation,
        lineWidth,
        strokeStyle,
        textAlign,
        textBaseline,
      });
    },
    scale(sx: number, sy: number): void {
      mat = [mat[0] * sx, mat[1] * sx, mat[2] * sy, mat[3] * sy, mat[4], mat[5]];
      calls.push({ a: mat[0], b: mat[1], c: mat[2], d: mat[3], e: mat[4], f: mat[5], op: 'transform' });
    },
    stroke(): void {
      if (pendingArc)
        calls.push({ op: 'arcStroke', ...pendingArc, lineWidth, strokeStyle });
      else if (pendingPath)
        calls.push({ closed: pendingPathClosed, lineWidth, op: 'polyStroke', pts: pendingPath, strokeStyle });
    },
    strokeRect(x: number, y: number, w: number, h: number): void {
      const [gx, gy] = applyMat(x, y);
      calls.push({ h, lineWidth, op: 'strokeRect', strokeStyle, w, x: gx, y: gy });
    },
    strokeText(text: string, x: number, y: number): void {
      const [gx, gy] = applyMat(x, y);
      calls.push({ font, lineWidth, op: 'strokeText', strokeStyle, text, x: gx, y: gy });
    },
    translate(tx: number, ty: number): void {
      mat = [
        mat[0],
        mat[1],
        mat[2],
        mat[3],
        mat[4] + mat[0] * tx + mat[2] * ty,
        mat[5] + mat[1] * tx + mat[3] * ty,
      ];
      calls.push({ a: mat[0], b: mat[1], c: mat[2], d: mat[3], e: mat[4], f: mat[5], op: 'transform' });
    },
  };
  return { calls, ctx2d: ctx as unknown as CanvasRenderingContext2D };
}

/** Filter out state-stack / transform bookkeeping for simple assertions. */
function drawCalls(calls: Call[]): Call[] {
  return calls.filter(c =>
    c.op !== 'save' && c.op !== 'restore' && c.op !== 'transform'
    && c.op !== 'setAlpha' && c.op !== 'setBlend',
  );
}

describe('canvas2DRenderer', () => {
  let world: EcsWorld;
  let renderer: Canvas2DRenderer;

  beforeEach(() => {
    world = new EcsWorld();
    world.registerComponent(PositionDef);
    world.registerComponent(RenderableDef);
    renderer = new Canvas2DRenderer();
  });

  describe('v1 byte-identical behavior', () => {
    it('draws a filled rect at position top-left (default anchor)', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 10, y: 20 });
      world.getStore(RenderableDef).set(id, { fill: '#f00', h: 40, kind: 'rect', w: 30 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        { fillStyle: '#f00', h: 40, op: 'fillRect', w: 30, x: 10, y: 20 },
      ]);
    });

    it('draws both fill and stroke when both are set', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(RenderableDef).set(id, {
        fill: '#0f0',
        h: 10,
        kind: 'rect',
        lineWidth: 2,
        stroke: '#f0f',
        w: 10,
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        { fillStyle: '#0f0', h: 10, op: 'fillRect', w: 10, x: 0, y: 0 },
        { h: 10, lineWidth: 2, op: 'strokeRect', strokeStyle: '#f0f', w: 10, x: 0, y: 0 },
      ]);
    });

    it('draws a stroked-only circle at position center (default anchor)', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 50, y: 60 });
      world.getStore(RenderableDef).set(id, {
        kind: 'circle',
        lineWidth: 1.5,
        radius: 8,
        stroke: '#aaa',
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        { lineWidth: 1.5, op: 'arcStroke', r: 8, strokeStyle: '#aaa', x: 50, y: 60 },
      ]);
    });

    it('skips entities with only renderable but no position', () => {
      const id = world.createEntity();
      world.getStore(RenderableDef).set(id, { fill: '#000', h: 10, kind: 'rect', w: 10 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([]);
    });

    it('draws nothing when neither fill nor stroke is set', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(RenderableDef).set(id, { h: 10, kind: 'rect', w: 10 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([]);
    });

    it('draws multiple entities in iteration order (no RenderOrderDef)', () => {
      const a = world.createEntity();
      world.getStore(PositionDef).set(a, { x: 1, y: 1 });
      world.getStore(RenderableDef).set(a, { fill: '#a00', h: 2, kind: 'rect', w: 2 });
      const b = world.createEntity();
      world.getStore(PositionDef).set(b, { x: 10, y: 10 });
      world.getStore(RenderableDef).set(b, { fill: '#0b0', h: 2, kind: 'rect', w: 2 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        { fillStyle: '#a00', h: 2, op: 'fillRect', w: 2, x: 1, y: 1 },
        { fillStyle: '#0b0', h: 2, op: 'fillRect', w: 2, x: 10, y: 10 },
      ]);
    });

    it('is a no-op on an empty world', () => {
      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });
      expect(drawCalls(rec.calls)).toEqual([]);
    });

    it('isolates canvas state with outer save/restore', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(RenderableDef).set(id, { fill: '#f00', h: 10, kind: 'rect', w: 10 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      const saveCount = rec.calls.filter(c => c.op === 'save').length;
      const restoreCount = rec.calls.filter(c => c.op === 'restore').length;
      expect(saveCount).toBeGreaterThanOrEqual(1);
      expect(restoreCount).toBe(saveCount);
    });

    it('does NOT save/restore per entity when no transform components are registered', () => {
      for (let i = 0; i < 3; i++) {
        const id = world.createEntity();
        world.getStore(PositionDef).set(id, { x: i, y: i });
        world.getStore(RenderableDef).set(id, { fill: '#fff', h: 1, kind: 'rect', w: 1 });
      }
      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      // Outer save/restore only (no per-entity isolation for V1 shapes
      // with no transform/opacity/blend).
      expect(rec.calls.filter(c => c.op === 'save')).toHaveLength(1);
      expect(rec.calls.filter(c => c.op === 'restore')).toHaveLength(1);
    });
  });

  describe('anchor — rect', () => {
    it('rect anchor:center shifts draw origin by (-w/2, -h/2)', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 100, y: 100 });
      world.getStore(RenderableDef).set(id, {
        anchor: 'center',
        fill: '#f00',
        h: 40,
        kind: 'rect',
        w: 30,
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        { fillStyle: '#f00', h: 40, op: 'fillRect', w: 30, x: 85, y: 80 },
      ]);
    });
  });

  describe('anchor — circle', () => {
    it('circle anchor:top-left shifts centre by (+r, +r)', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(RenderableDef).set(id, {
        anchor: 'top-left',
        fill: '#f4c542',
        kind: 'circle',
        radius: 7,
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        { fillStyle: '#f4c542', op: 'arcFill', r: 7, x: 7, y: 7 },
      ]);
    });
  });

  describe('polygon', () => {
    it('draws a closed filled triangle', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 10, y: 20 });
      world.getStore(RenderableDef).set(id, {
        closed: true,
        fill: '#0f0',
        kind: 'polygon',
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }],
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        {
          closed: true,
          fillStyle: '#0f0',
          op: 'polyFill',
          pts: [[10, 20], [20, 20], [15, 28]],
        },
      ]);
    });

    it('draws an open stroked polyline (no closePath)', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(RenderableDef).set(id, {
        closed: false,
        kind: 'polygon',
        lineWidth: 2,
        points: [{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 0 }],
        stroke: '#fa4',
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        {
          closed: false,
          lineWidth: 2,
          op: 'polyStroke',
          pts: [[0, 0], [5, 5], [10, 0]],
          strokeStyle: '#fa4',
        },
      ]);
    });
  });

  describe('rotation + scale', () => {
    it('rotates rect around position when RotationDef is present', () => {
      world.registerComponent(RotationDef);
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 100, y: 100 });
      world.getStore(RotationDef).set(id, { angle: Math.PI / 2 });
      world.getStore(RenderableDef).set(id, {
        anchor: 'center',
        fill: '#fff',
        h: 10,
        kind: 'rect',
        w: 10,
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      // Rotated 90°, anchored center: rect corner ends up roughly at
      // (100 + 5, 100 - 5). Exact transform math: local (-5, -5) ->
      // rotate 90° -> (5, -5) -> translate (100, 100) -> (105, 95).
      const drawn = drawCalls(rec.calls);
      expect(drawn).toHaveLength(1);
      const call = drawn[0]! as { op: string; x: number; y: number };
      expect(call.op).toBe('fillRect');
      expect(call.x).toBeCloseTo(105);
      expect(call.y).toBeCloseTo(95);
    });

    it('scales via ScaleDef around the pivot', () => {
      world.registerComponent(ScaleDef);
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(ScaleDef).set(id, { x: 2, y: 2 });
      world.getStore(RenderableDef).set(id, {
        fill: '#fff',
        h: 10,
        kind: 'rect',
        w: 10,
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      // Position (0,0), scale 2x, rect 10x10 at local (0,0). Top-left
      // in global space stays at (0,0); size effectively doubles but
      // the mock records local (0, 0, 10, 10) translated by matrix.
      const drawn = drawCalls(rec.calls);
      expect(drawn).toHaveLength(1);
      const call = drawn[0]! as { op: string; x: number; y: number; w: number; h: number };
      expect(call.op).toBe('fillRect');
      expect(call.x).toBeCloseTo(0);
      expect(call.y).toBeCloseTo(0);
    });

    it('skips rotation path when angle is 0 (V1 byte-identical)', () => {
      world.registerComponent(RotationDef);
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 10, y: 20 });
      world.getStore(RotationDef).set(id, { angle: 0 });
      world.getStore(RenderableDef).set(id, {
        fill: '#f00',
        h: 40,
        kind: 'rect',
        w: 30,
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      // Same call list as V1 — no per-entity save/restore.
      expect(rec.calls.filter(c => c.op === 'save')).toHaveLength(1);
      expect(drawCalls(rec.calls)).toEqual([
        { fillStyle: '#f00', h: 40, op: 'fillRect', w: 30, x: 10, y: 20 },
      ]);
    });
  });

  describe('opacity', () => {
    it('applies globalAlpha when OpacityDef is set', () => {
      world.registerComponent(OpacityDef);
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(OpacityDef).set(id, { value: 0.5 });
      world.getStore(RenderableDef).set(id, { fill: '#fff', h: 5, kind: 'rect', w: 5 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(rec.calls.filter(c => c.op === 'setAlpha')).toEqual([
        { op: 'setAlpha', value: 0.5 },
      ]);
    });
  });

  describe('renderOrder', () => {
    it('draws lower order first (ascending)', () => {
      world.registerComponent(RenderOrderDef);
      const top = world.createEntity();
      world.getStore(PositionDef).set(top, { x: 1, y: 1 });
      world.getStore(RenderOrderDef).set(top, { value: 10 });
      world.getStore(RenderableDef).set(top, { fill: '#top', h: 1, kind: 'rect', w: 1 });

      const bottom = world.createEntity();
      world.getStore(PositionDef).set(bottom, { x: 2, y: 2 });
      world.getStore(RenderOrderDef).set(bottom, { value: 0 });
      world.getStore(RenderableDef).set(bottom, { fill: '#bot', h: 1, kind: 'rect', w: 1 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      const fillStyles = drawCalls(rec.calls).map(c =>
        (c as { fillStyle?: string }).fillStyle,
      );
      expect(fillStyles).toEqual(['#bot', '#top']);
    });

    it('ties break on insertion order', () => {
      world.registerComponent(RenderOrderDef);
      const a = world.createEntity();
      world.getStore(PositionDef).set(a, { x: 0, y: 0 });
      world.getStore(RenderOrderDef).set(a, { value: 5 });
      world.getStore(RenderableDef).set(a, { fill: '#a', h: 1, kind: 'rect', w: 1 });
      const b = world.createEntity();
      world.getStore(PositionDef).set(b, { x: 1, y: 1 });
      world.getStore(RenderOrderDef).set(b, { value: 5 });
      world.getStore(RenderableDef).set(b, { fill: '#b', h: 1, kind: 'rect', w: 1 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      const fillStyles = drawCalls(rec.calls).map(c =>
        (c as { fillStyle?: string }).fillStyle,
      );
      expect(fillStyles).toEqual(['#a', '#b']);
    });

    it('short-circuits sort when no entity has RenderOrderDef', () => {
      // Register but don't set the component on any entity.
      world.registerComponent(RenderOrderDef);
      const a = world.createEntity();
      world.getStore(PositionDef).set(a, { x: 1, y: 1 });
      world.getStore(RenderableDef).set(a, { fill: '#a', h: 1, kind: 'rect', w: 1 });
      const b = world.createEntity();
      world.getStore(PositionDef).set(b, { x: 2, y: 2 });
      world.getStore(RenderableDef).set(b, { fill: '#b', h: 1, kind: 'rect', w: 1 });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      const fillStyles = drawCalls(rec.calls).map(c =>
        (c as { fillStyle?: string }).fillStyle,
      );
      expect(fillStyles).toEqual(['#a', '#b']);
    });
  });

  describe('blendMode', () => {
    it('applies globalCompositeOperation when set', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(RenderableDef).set(id, {
        blendMode: 'screen',
        fill: '#fff',
        h: 5,
        kind: 'rect',
        w: 5,
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(rec.calls.filter(c => c.op === 'setBlend')).toEqual([
        { op: 'setBlend', value: 'screen' },
      ]);
    });
  });

  describe('text', () => {
    it('draws filled text at position', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 10, y: 20 });
      world.getStore(RenderableDef).set(id, {
        align: 'center',
        baseline: 'middle',
        fill: '#fff',
        font: '16px sans',
        kind: 'text',
        text: 'hi',
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      expect(drawCalls(rec.calls)).toEqual([
        {
          align: 'center',
          baseline: 'middle',
          fillStyle: '#fff',
          font: '16px sans',
          op: 'fillText',
          text: 'hi',
          x: 10,
          y: 20,
        },
      ]);
    });

    it('uses Canvas2D defaults (left/alphabetic) when align/baseline are omitted', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 0, y: 0 });
      world.getStore(RenderableDef).set(id, {
        fill: '#fff',
        font: '16px sans',
        kind: 'text',
        text: 'hi',
      });

      const rec = makeRecorder();
      renderer.render({ ctx2d: rec.ctx2d, world });

      const calls = drawCalls(rec.calls);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ align: 'left', baseline: 'alphabetic', op: 'fillText' });
    });
  });

  describe('renderer works when optional components aren\'t registered', () => {
    it('draws V1 content without RotationDef/OpacityDef/etc. registered', () => {
      const id = world.createEntity();
      world.getStore(PositionDef).set(id, { x: 1, y: 2 });
      world.getStore(RenderableDef).set(id, { fill: '#f00', h: 3, kind: 'rect', w: 4 });

      const rec = makeRecorder();
      expect(() => renderer.render({ ctx2d: rec.ctx2d, world })).not.toThrow();

      expect(drawCalls(rec.calls)).toEqual([
        { fillStyle: '#f00', h: 3, op: 'fillRect', w: 4, x: 1, y: 2 },
      ]);
    });
  });
});

describe('renderableDef', () => {
  it('round-trips rect through serialize/deserialize', () => {
    const value = {
      fill: '#fff',
      h: 20,
      kind: 'rect' as const,
      lineWidth: 2,
      stroke: '#000',
      w: 10,
    };
    const raw = RenderableDef.serialize(value);
    const got = RenderableDef.deserialize(raw, 'r');
    expect(got).toMatchObject(value);
  });

  it('round-trips circle with only stroke', () => {
    const value = {
      kind: 'circle' as const,
      lineWidth: 1.5,
      radius: 5,
      stroke: '#aaa',
    };
    const got = RenderableDef.deserialize(RenderableDef.serialize(value), 'r');
    expect(got).toMatchObject(value);
  });

  it('round-trips rect anchor center', () => {
    const value = {
      anchor: 'center' as const,
      fill: '#fff',
      h: 10,
      kind: 'rect' as const,
      w: 10,
    };
    const got = RenderableDef.deserialize(RenderableDef.serialize(value), 'r');
    expect(got).toMatchObject(value);
  });

  it('round-trips polygon closed', () => {
    const value = {
      closed: true,
      fill: '#0f0',
      kind: 'polygon' as const,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }],
    };
    const got = RenderableDef.deserialize(RenderableDef.serialize(value), 'r');
    expect(got).toMatchObject(value);
  });

  it('round-trips text', () => {
    const value = {
      align: 'center' as const,
      baseline: 'middle' as const,
      fill: '#fff',
      font: '14px sans',
      kind: 'text' as const,
      text: 'hi',
    };
    const got = RenderableDef.deserialize(RenderableDef.serialize(value), 'r');
    expect(got).toMatchObject(value);
  });

  it('round-trips blendMode on rect', () => {
    const value = {
      blendMode: 'screen' as const,
      fill: '#fff',
      h: 1,
      kind: 'rect' as const,
      w: 1,
    };
    const got = RenderableDef.deserialize(RenderableDef.serialize(value), 'r');
    expect(got).toMatchObject(value);
  });

  it('round-trips sprite with dw/dh and anchor', () => {
    const value = {
      anchor: 'center' as const,
      atlas: 'space',
      dh: 40,
      dw: 36,
      frame: 'ship_C.png',
      kind: 'sprite' as const,
    };
    const got = RenderableDef.deserialize(RenderableDef.serialize(value), 'r');
    expect(got).toMatchObject(value);
  });

  it('round-trips sprite with default size (no dw/dh)', () => {
    const value = {
      atlas: 'space',
      frame: 'enemy_A.png',
      kind: 'sprite' as const,
    };
    const got = RenderableDef.deserialize(RenderableDef.serialize(value), 'r') as {
      atlas: string;
      dh?: number;
      dw?: number;
      frame: string;
      kind: string;
    };
    expect(got).toMatchObject(value);
    expect(got.dw).toBeUndefined();
    expect(got.dh).toBeUndefined();
  });

  it('rejects unknown kinds', () => {
    expect(() => RenderableDef.deserialize({ kind: 'triangle' }, 'r'))
      .toThrow(/kind/);
  });

  it('rejects negative rect dimensions', () => {
    expect(() => RenderableDef.deserialize({ h: 10, kind: 'rect', w: -1 }, 'r'))
      .toThrow(/non-negative/);
    expect(() => RenderableDef.deserialize({ h: -1, kind: 'rect', w: 10 }, 'r'))
      .toThrow(/non-negative/);
  });

  it('rejects negative circle radius', () => {
    expect(() => RenderableDef.deserialize({ kind: 'circle', radius: -5 }, 'r'))
      .toThrow(/non-negative/);
  });

  it('rejects bad rect anchor value', () => {
    expect(() => RenderableDef.deserialize(
      { anchor: 'middle', h: 1, kind: 'rect', w: 1 },
      'r',
    )).toThrow(/anchor/);
  });

  it('rejects sprite with a non-string atlas', () => {
    expect(() => RenderableDef.deserialize(
      { frame: 'ship_C.png', kind: 'sprite' },
      'r',
    )).toThrow(/atlas/);
  });

  it('rejects sprite with a non-string frame', () => {
    expect(() => RenderableDef.deserialize(
      { atlas: 'space', kind: 'sprite' },
      'r',
    )).toThrow(/frame/);
  });

  it('rejects sprite with negative dw/dh', () => {
    expect(() => RenderableDef.deserialize(
      { atlas: 'space', dw: -1, frame: 'ship_C.png', kind: 'sprite' },
      'r',
    )).toThrow(/non-negative/);
    expect(() => RenderableDef.deserialize(
      { atlas: 'space', dh: -1, frame: 'ship_C.png', kind: 'sprite' },
      'r',
    )).toThrow(/non-negative/);
  });

  it('rejects sprite with a bad anchor value', () => {
    expect(() => RenderableDef.deserialize(
      { anchor: 'middle', atlas: 'space', frame: 'ship_C.png', kind: 'sprite' },
      'r',
    )).toThrow(/anchor/);
  });

  it('rejects fill on open polygon with an informative message', () => {
    expect(() => RenderableDef.deserialize(
      {
        closed: false,
        fill: '#f00',
        kind: 'polygon',
        points: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      },
      'r',
    )).toThrow(/open polygon/i);
  });

  it('rejects polygon with fewer than 2 points', () => {
    expect(() => RenderableDef.deserialize(
      {
        closed: true,
        kind: 'polygon',
        points: [{ x: 0, y: 0 }],
        stroke: '#fff',
      },
      'r',
    )).toThrow(/at least 2 points/);
  });

  it('requires position component', () => {
    expect(RenderableDef.requires).toEqual(['position']);
  });
});

describe('opacityDef', () => {
  it('round-trips value in [0, 1]', () => {
    expect(OpacityDef.deserialize({ value: 0.5 }, 'o')).toEqual({ value: 0.5 });
    expect(OpacityDef.deserialize({ value: 0 }, 'o')).toEqual({ value: 0 });
    expect(OpacityDef.deserialize({ value: 1 }, 'o')).toEqual({ value: 1 });
  });

  it('rejects out-of-range values', () => {
    expect(() => OpacityDef.deserialize({ value: -0.1 }, 'o')).toThrow(/0\.\.1/);
    expect(() => OpacityDef.deserialize({ value: 1.5 }, 'o')).toThrow(/0\.\.1/);
  });
});

describe('renderOrderDef', () => {
  it('round-trips', () => {
    expect(RenderOrderDef.deserialize(
      RenderOrderDef.serialize({ value: 10 }),
      'o',
    )).toEqual({ value: 10 });
  });
});

describe('canvas2DRenderer sprite rendering', () => {
  const image = {} as CanvasImageSource;
  const atlases: SpriteFrameSource = {
    getFrame: (atlas, frame) =>
      atlas === 'space' && frame === 'ship'
        ? { image, sh: 96, sw: 96, sx: 10, sy: 20 }
        : undefined,
  };

  let world: EcsWorld;
  let renderer: Canvas2DRenderer;

  beforeEach(() => {
    world = new EcsWorld();
    world.registerComponent(PositionDef);
    world.registerComponent(RenderableDef);
    renderer = new Canvas2DRenderer();
  });

  it('draws a sprite centered on its position by default', () => {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: 100, y: 200 });
    world.getStore(RenderableDef).set(id, { atlas: 'space', frame: 'ship', kind: 'sprite' });

    const rec = makeRecorder();
    renderer.render({ atlases, ctx2d: rec.ctx2d, world });

    expect(drawCalls(rec.calls)).toEqual([
      { dh: 96, dw: 96, dx: 52, dy: 152, op: 'drawImage', sh: 96, sw: 96, sx: 10, sy: 20 },
    ]);
  });

  it('honors top-left anchor and dw/dh overrides', () => {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: 100, y: 200 });
    world.getStore(RenderableDef).set(id, {
      anchor: 'top-left',
      atlas: 'space',
      dh: 32,
      dw: 48,
      frame: 'ship',
      kind: 'sprite',
    });

    const rec = makeRecorder();
    renderer.render({ atlases, ctx2d: rec.ctx2d, world });

    expect(drawCalls(rec.calls)).toEqual([
      { dh: 32, dw: 48, dx: 100, dy: 200, op: 'drawImage', sh: 96, sw: 96, sx: 10, sy: 20 },
    ]);
  });

  it('draws nothing when the frame is unknown', () => {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: 0, y: 0 });
    world.getStore(RenderableDef).set(id, { atlas: 'space', frame: 'missing', kind: 'sprite' });

    const rec = makeRecorder();
    renderer.render({ atlases, ctx2d: rec.ctx2d, world });

    expect(drawCalls(rec.calls)).toEqual([]);
  });

  it('draws nothing when no atlas registry is supplied', () => {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: 0, y: 0 });
    world.getStore(RenderableDef).set(id, { atlas: 'space', frame: 'ship', kind: 'sprite' });

    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, world });

    expect(drawCalls(rec.calls)).toEqual([]);
  });
});

describe('canvas2DRenderer camera view + cull', () => {
  let world: EcsWorld;
  let renderer: Canvas2DRenderer;

  beforeEach(() => {
    world = new EcsWorld();
    world.registerComponent(PositionDef);
    world.registerComponent(RenderableDef);
    renderer = new Canvas2DRenderer();
  });

  function addRect(x: number, y: number, w = 10, h = 10): void {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x, y });
    world.getStore(RenderableDef).set(id, { fill: '#fff', h, kind: 'rect', w });
  }

  it('applies the view transform to draw coords (translate + zoom)', () => {
    addRect(100, 50);
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 90, y: 40, zoom: 2 }, world });
    // screen = (world − viewTopLeft) · zoom = (100−90, 50−40)·2 = (20, 20).
    expect(drawCalls(rec.calls)).toEqual([
      { fillStyle: '#fff', h: 10, op: 'fillRect', w: 10, x: 20, y: 20 },
    ]);
  });

  it('defaults zoom to 1 (translate only)', () => {
    addRect(100, 50);
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 10, y: 5 }, world });
    expect(drawCalls(rec.calls)).toEqual([
      { fillStyle: '#fff', h: 10, op: 'fillRect', w: 10, x: 90, y: 45 },
    ]);
  });

  it('culls a rect fully outside the view rect', () => {
    addRect(5000, 5000); // canvas is 800×600 at view origin (0,0), zoom 1
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 0, y: 0 }, world });
    expect(drawCalls(rec.calls)).toEqual([]);
  });

  it('keeps a rect straddling the view edge', () => {
    addRect(795, 10); // right edge at 805, view maxX = 800 → overlaps
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 0, y: 0 }, world });
    expect(drawCalls(rec.calls)).toHaveLength(1);
  });

  it('never culls text or sprite renderables (no reliable bounds)', () => {
    const t = world.createEntity();
    world.getStore(PositionDef).set(t, { x: 9000, y: 9000 });
    world.getStore(RenderableDef).set(t, { fill: '#fff', font: '10px sans', kind: 'text', text: 'hi' });
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 0, y: 0 }, world });
    expect(drawCalls(rec.calls)).toHaveLength(1);
  });

  it('culls under zoom using the zoomed view rect', () => {
    // zoom 2 halves the visible world span: view sees [0,400]×[0,300].
    addRect(450, 10); // outside the zoomed view rect
    addRect(100, 10); // inside
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 0, y: 0, zoom: 2 }, world });
    expect(drawCalls(rec.calls)).toHaveLength(1);
  });

  it('culls a center-anchored rect by its centered AABB', () => {
    const inside = world.createEntity();
    world.getStore(PositionDef).set(inside, { x: 2, y: 10 });
    world.getStore(RenderableDef).set(inside, { anchor: 'center', fill: '#fff', h: 10, kind: 'rect', w: 10 });
    const outside = world.createEntity();
    // centre at x=-20, half-width 5 → right edge −15 < view minX 0 → culled.
    world.getStore(PositionDef).set(outside, { x: -20, y: 10 });
    world.getStore(RenderableDef).set(outside, { anchor: 'center', fill: '#0f0', h: 10, kind: 'rect', w: 10 });
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 0, y: 0 }, world });
    expect(drawCalls(rec.calls)).toHaveLength(1);
  });

  it('culls a circle by its radius AABB (center + top-left anchors)', () => {
    const inside = world.createEntity();
    world.getStore(PositionDef).set(inside, { x: 20, y: 20 });
    world.getStore(RenderableDef).set(inside, { fill: '#fff', kind: 'circle', radius: 6 });
    const outside = world.createEntity();
    // center anchor at x=-10, r=6 → right edge −4 < 0 → culled.
    world.getStore(PositionDef).set(outside, { x: -10, y: 20 });
    world.getStore(RenderableDef).set(outside, { fill: '#0f0', kind: 'circle', radius: 6 });
    const tl = world.createEntity();
    // top-left anchor at x=790, centre x=796, r=6 → left edge 790 < maxX 800 → kept.
    world.getStore(PositionDef).set(tl, { x: 790, y: 20 });
    world.getStore(RenderableDef).set(tl, { anchor: 'top-left', fill: '#00f', kind: 'circle', radius: 6 });
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 0, y: 0 }, world });
    expect(drawCalls(rec.calls)).toHaveLength(2);
  });

  it('draws normally (no transform, no cull) when view is absent', () => {
    addRect(5000, 5000);
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, world });
    expect(drawCalls(rec.calls)).toEqual([
      { fillStyle: '#fff', h: 10, op: 'fillRect', w: 10, x: 5000, y: 5000 },
    ]);
  });

  it('culls within the ordered (RenderOrderDef) path too', () => {
    world.registerComponent(RenderOrderDef);
    addRect(100, 10); // visible
    const off = world.createEntity();
    world.getStore(PositionDef).set(off, { x: 5000, y: 5000 });
    world.getStore(RenderableDef).set(off, { fill: '#0f0', h: 10, kind: 'rect', w: 10 });
    world.getStore(RenderOrderDef).set(off, { value: 1 });
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, view: { x: 0, y: 0 }, world });
    expect(drawCalls(rec.calls)).toEqual([
      { fillStyle: '#fff', h: 10, op: 'fillRect', w: 10, x: 100, y: 10 },
    ]);
  });
});
