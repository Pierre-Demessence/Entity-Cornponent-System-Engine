import { EcsWorld } from '@pierre/ecs';
import { PositionDef } from '@pierre/ecs/modules/transform';

/**
 * Parallel-kernel harness — evidence for step B2 (parallel dispatch over
 * SharedArrayBuffer) in docs/plans/ecs-parallelism-and-soa-storage.md.
 *
 * Each tick runs a deliberately heavy, embarrassingly-parallel per-entity
 * kernel: every entity is pulled by K fixed attractors (O(n·K), a sqrt per
 * pair). This is *single-threaded* here — the point is to show the simulation
 * is genuinely **core-bound** (raise the entity count or the kernel weight and
 * "sim" ms dominates the frame), which is the prerequisite that justifies B2:
 * splitting the kernel across workers over shared-memory columns. A "parallel"
 * toggle is added once SAB-backed columns + worker dispatch land.
 */

const W = 800;
const H = 600;
const STEP = 6; // px/s pull toward the net attractor direction
const HISTORY = W;

const BG = rgba(11, 15, 20);
const DOT = rgba(127, 212, 255);

function rgba(r: number, g: number, b: number): number {
  return ((0xFF << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

function wrap(v: number, max: number): number {
  if (v < 0)
    return v + max;
  if (v >= max)
    return v - max;
  return v;
}

interface Sim {
  attractorCount: number;
  ax: Float32Array;
  ay: Float32Array;
  count: number;
  px: Float32Array | Float64Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;
  py: Float32Array | Float64Array | Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array;
}

function makeSim(count: number, attractorCount: number): Sim {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  const store = world.getStore(PositionDef);
  for (let i = 0; i < count; i++) {
    const id = world.createEntity();
    store.set(id, { x: Math.random() * W, y: Math.random() * H });
  }
  const col = world.getColumnStore(PositionDef);
  const ax = new Float32Array(attractorCount);
  const ay = new Float32Array(attractorCount);
  for (let k = 0; k < attractorCount; k++) {
    const a = (k / attractorCount) * Math.PI * 2;
    ax[k] = W / 2 + Math.cos(a) * (W * 0.35);
    ay[k] = H / 2 + Math.sin(a) * (H * 0.35);
  }
  return { attractorCount, ax, ay, count, px: col.column('x'), py: col.column('y') };
}

function stepSim(sim: Sim, dt: number): void {
  const { attractorCount: K, ax, ay, count, px, py } = sim;
  const pull = STEP * dt;
  for (let s = 0; s < count; s++) {
    const x = px[s];
    const y = py[s];
    let fx = 0;
    let fy = 0;
    for (let k = 0; k < K; k++) {
      const dx = ax[k] - x;
      const dy = ay[k] - y;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 100);
      fx += dx * inv;
      fy += dy * inv;
    }
    px[s] = wrap(x + fx * pull, W);
    py[s] = wrap(y + fy * pull, H);
  }
}

function drawGraph(gctx: CanvasRenderingContext2D, history: number[], refreshMs: number): void {
  const gw = W;
  const gh = 120;
  gctx.fillStyle = '#0e141c';
  gctx.fillRect(0, 0, gw, gh);

  let observedMax = refreshMs * 2;
  for (const ms of history) {
    if (ms > observedMax)
      observedMax = ms;
  }
  const maxMs = observedMax * 1.1;
  const yOf = (ms: number): number => gh - (ms / maxMs) * gh;

  gctx.strokeStyle = 'rgba(120, 220, 140, 0.5)';
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(0, yOf(refreshMs));
  gctx.lineTo(gw, yOf(refreshMs));
  gctx.stroke();
  gctx.fillStyle = 'rgba(120, 220, 140, 0.8)';
  gctx.font = '11px system-ui';
  gctx.fillText(`${refreshMs.toFixed(1)} ms (vsync / refresh)`, 6, yOf(refreshMs) - 4);

  gctx.strokeStyle = '#7fd4ff';
  gctx.lineWidth = 1.5;
  gctx.beginPath();
  const start = Math.max(0, history.length - gw);
  for (let i = start; i < history.length; i++) {
    const x = i - start;
    const y = yOf(history[i]);
    if (i === start)
      gctx.moveTo(x, y);
    else
      gctx.lineTo(x, y);
  }
  gctx.stroke();
}

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:16px;align-items:center;padding:8px 0;flex-wrap:wrap';

  const mkSlider = (label: string, min: number, max: number, step: number, value: number): { el: HTMLInputElement; text: HTMLSpanElement } => {
    const wrapEl = document.createElement('label');
    wrapEl.style.cssText = 'font:13px system-ui;display:flex;gap:8px;align-items:center';
    const el = document.createElement('input');
    el.type = 'range';
    el.min = String(min);
    el.max = String(max);
    el.step = String(step);
    el.value = String(value);
    el.style.width = '180px';
    const text = document.createElement('span');
    text.style.cssText = 'min-width:64px;font-variant-numeric:tabular-nums';
    wrapEl.append(`${label}:`, el, text);
    controls.append(wrapEl);
    return { el, text };
  };

  const count = mkSlider('Entities', 10000, 1000000, 10000, 100000);
  const kernel = mkSlider('Kernel K', 1, 64, 1, 8);

  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:100%';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = 'display:block;background:#0b0f14;width:100%';
  const ctx = canvas.getContext('2d')!;

  const panel = document.createElement('div');
  panel.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(6,10,15,0.72);border:1px solid #1c2833;border-radius:6px;padding:8px 10px;font:12px/1.6 ui-monospace,monospace;min-width:170px';
  const panelRow = (label: string): HTMLSpanElement => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;justify-content:space-between;gap:16px';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.color = '#7f95a8';
    const v = document.createElement('span');
    v.style.color = '#dfe7ef';
    r.append(l, v);
    panel.append(r);
    return v;
  };
  const fpsV = panelRow('fps');
  const frameV = panelRow('frame');
  const simV = panelRow('sim (kernel)');
  const renderV = panelRow('render');
  const entV = panelRow('entities');
  const kV = panelRow('kernel K');
  stage.append(canvas, panel);

  const graph = document.createElement('canvas');
  graph.width = W;
  graph.height = 120;
  graph.style.cssText = 'display:block;width:100%;margin-top:8px';
  const gctx = graph.getContext('2d')!;

  const caption = document.createElement('div');
  caption.style.cssText = 'padding:8px 0;font:12px system-ui;color:#6f8296';
  caption.textContent = 'Single-threaded, on purpose. Each tick every entity is pulled by K attractors (O(n·K)). Raise Entities or Kernel K until "sim" dominates the frame and the graph climbs past the vsync line — that core-bound simulation is the case B2 (parallel dispatch over shared-memory columns) is meant to speed up.';

  container.append(controls, stage, graph, caption);

  const img = ctx.createImageData(W, H);
  const pixels = new Uint32Array(img.data.buffer);

  let sim = makeSim(Number(count.el.value), Number(kernel.el.value));
  let history: number[] = [];
  let simMsAvg = 0;
  let renderMsAvg = 0;
  let frameMsAvg = 0;
  let fps = 0;
  let lastFrame = performance.now();
  let refreshMs = 0;
  const calib: number[] = [];

  const fmt = (n: number): string => n.toLocaleString('en-US');
  const rebuild = (): void => {
    sim = makeSim(Number(count.el.value), Number(kernel.el.value));
    history = [];
    simMsAvg = 0;
    renderMsAvg = 0;
    frameMsAvg = 0;
    fps = 0;
    lastFrame = performance.now();
  };
  count.text.textContent = fmt(Number(count.el.value));
  kernel.text.textContent = String(kernel.el.value);
  count.el.addEventListener('input', () => {
    count.text.textContent = fmt(Number(count.el.value));
  });
  kernel.el.addEventListener('input', () => {
    kernel.text.textContent = String(kernel.el.value);
  });
  count.el.addEventListener('change', rebuild);
  kernel.el.addEventListener('change', rebuild);

  const ema = (avg: number, sample: number): number => avg === 0 ? sample : avg * 0.9 + sample * 0.1;

  let rafId = 0;
  const loop = (now: number): void => {
    const frameDelta = now - lastFrame;
    lastFrame = now;
    fps = fps === 0 ? 1000 / frameDelta : fps * 0.9 + (1000 / frameDelta) * 0.1;
    if (refreshMs === 0 && frameDelta > 2 && frameDelta < 100) {
      calib.push(frameDelta);
      if (calib.length >= 60)
        refreshMs = median(calib);
    }
    history.push(frameDelta);
    if (history.length > HISTORY)
      history.shift();

    const t0 = performance.now();
    stepSim(sim, Math.min(frameDelta, 33) / 1000);
    const simMs = performance.now() - t0;

    const t1 = performance.now();
    pixels.fill(BG);
    const { count: n, px, py } = sim;
    for (let s = 0; s < n; s++) {
      const x = px[s] | 0;
      const y = py[s] | 0;
      if (x >= 0 && x < W && y >= 0 && y < H)
        pixels[y * W + x] = DOT;
    }
    ctx.putImageData(img, 0, 0);
    const renderMs = performance.now() - t1;

    simMsAvg = ema(simMsAvg, simMs);
    renderMsAvg = ema(renderMsAvg, renderMs);
    frameMsAvg = ema(frameMsAvg, frameDelta);
    drawGraph(gctx, history, refreshMs || (1000 / 60));

    fpsV.textContent = fps.toFixed(0);
    frameV.textContent = `${frameMsAvg.toFixed(2)} ms`;
    simV.textContent = `${simMsAvg.toFixed(2)} ms`;
    renderV.textContent = `${renderMsAvg.toFixed(2)} ms`;
    entV.textContent = fmt(sim.count);
    kV.textContent = String(sim.attractorCount);

    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  return (): void => {
    window.cancelAnimationFrame(rafId);
    container.innerHTML = '';
  };
}
