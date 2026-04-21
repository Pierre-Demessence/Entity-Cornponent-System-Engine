import { EcsWorld } from '#world';
import { beforeEach, describe, expect, it } from 'vitest';

import { PositionDef } from '../transform/position';
import { Canvas2DRenderer } from './canvas2d-renderer';
import { RenderableDef } from './renderable';

type Call
  = | { op: 'fillRect'; x: number; y: number; w: number; h: number; fillStyle: string }
    | { op: 'strokeRect'; x: number; y: number; w: number; h: number; strokeStyle: string; lineWidth: number }
    | { op: 'arcFill'; x: number; y: number; r: number; fillStyle: string }
    | { op: 'arcStroke'; x: number; y: number; r: number; strokeStyle: string; lineWidth: number };

function makeRecorder(): { ctx2d: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  let fillStyle = '';
  let strokeStyle = '';
  let lineWidth = 1;
  // Circle path tracking — the renderer does beginPath/arc/fill-or-stroke.
  let pendingArc: { x: number; y: number; r: number } | null = null;

  const ctx = {
    get fillStyle(): string { return fillStyle; },
    set fillStyle(value: string) { fillStyle = value; },
    get lineWidth(): number { return lineWidth; },
    set lineWidth(value: number) { lineWidth = value; },
    restore(): void {},
    save(): void {},
    get strokeStyle(): string { return strokeStyle; },
    set strokeStyle(value: string) { strokeStyle = value; },
    arc(x: number, y: number, r: number): void {
      pendingArc = { r, x, y };
    },
    beginPath(): void {
      pendingArc = null;
    },
    fill(): void {
      if (pendingArc)
        calls.push({ op: 'arcFill', ...pendingArc, fillStyle });
    },
    fillRect(x: number, y: number, w: number, h: number): void {
      calls.push({ fillStyle, h, op: 'fillRect', w, x, y });
    },
    stroke(): void {
      if (pendingArc)
        calls.push({ op: 'arcStroke', ...pendingArc, lineWidth, strokeStyle });
    },
    strokeRect(x: number, y: number, w: number, h: number): void {
      calls.push({ h, lineWidth, op: 'strokeRect', strokeStyle, w, x, y });
    },
  };
  return { calls, ctx2d: ctx as unknown as CanvasRenderingContext2D };
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

  it('draws a filled rect at position top-left', () => {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: 10, y: 20 });
    world.getStore(RenderableDef).set(id, { fill: '#f00', h: 40, kind: 'rect', w: 30 });

    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, world });

    expect(rec.calls).toEqual([
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

    expect(rec.calls).toEqual([
      { fillStyle: '#0f0', h: 10, op: 'fillRect', w: 10, x: 0, y: 0 },
      { h: 10, lineWidth: 2, op: 'strokeRect', strokeStyle: '#f0f', w: 10, x: 0, y: 0 },
    ]);
  });

  it('draws a stroked-only circle at position center', () => {
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

    expect(rec.calls).toEqual([
      { lineWidth: 1.5, op: 'arcStroke', r: 8, strokeStyle: '#aaa', x: 50, y: 60 },
    ]);
  });

  it('skips entities with only renderable but no position', () => {
    const id = world.createEntity();
    world.getStore(RenderableDef).set(id, { fill: '#000', h: 10, kind: 'rect', w: 10 });

    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, world });

    expect(rec.calls).toEqual([]);
  });

  it('draws nothing when neither fill nor stroke is set', () => {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: 0, y: 0 });
    world.getStore(RenderableDef).set(id, { h: 10, kind: 'rect', w: 10 });

    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, world });

    expect(rec.calls).toEqual([]);
  });

  it('draws multiple entities in iteration order', () => {
    const a = world.createEntity();
    world.getStore(PositionDef).set(a, { x: 1, y: 1 });
    world.getStore(RenderableDef).set(a, { fill: '#a00', h: 2, kind: 'rect', w: 2 });
    const b = world.createEntity();
    world.getStore(PositionDef).set(b, { x: 10, y: 10 });
    world.getStore(RenderableDef).set(b, { fill: '#0b0', h: 2, kind: 'rect', w: 2 });

    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, world });

    expect(rec.calls).toEqual([
      { fillStyle: '#a00', h: 2, op: 'fillRect', w: 2, x: 1, y: 1 },
      { fillStyle: '#0b0', h: 2, op: 'fillRect', w: 2, x: 10, y: 10 },
    ]);
  });

  it('is a no-op on an empty world', () => {
    const rec = makeRecorder();
    renderer.render({ ctx2d: rec.ctx2d, world });
    expect(rec.calls).toEqual([]);
  });

  it('isolates canvas state with save/restore', () => {
    const id = world.createEntity();
    world.getStore(PositionDef).set(id, { x: 0, y: 0 });
    world.getStore(RenderableDef).set(id, {
      fill: '#f00',
      h: 10,
      kind: 'rect',
      lineWidth: 3,
      stroke: '#0f0',
      w: 10,
    });

    let saveCalls = 0;
    let restoreCalls = 0;
    const rec = makeRecorder();
    const tracked = new Proxy(rec.ctx2d, {
      get(target, prop, recv) {
        if (prop === 'save')
          return () => { saveCalls++; };
        if (prop === 'restore')
          return () => { restoreCalls++; };
        return Reflect.get(target, prop, recv);
      },
    });
    renderer.render({ ctx2d: tracked as CanvasRenderingContext2D, world });

    expect(saveCalls).toBe(1);
    expect(restoreCalls).toBe(1);
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
    expect(got).toEqual(value);
  });

  it('round-trips circle with only stroke', () => {
    const value = {
      kind: 'circle' as const,
      lineWidth: 1.5,
      radius: 5,
      stroke: '#aaa',
    };
    const raw = RenderableDef.serialize(value);
    const got = RenderableDef.deserialize(raw, 'r');
    expect(got).toEqual(value);
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

  it('requires position component', () => {
    expect(RenderableDef.requires).toEqual(['position']);
  });
});
