import { EcsWorld } from '@pierre/ecs';
import { PositionDef } from '@pierre/ecs/modules/transform';

/**
 * Parallel-kernel harness — step B2 (parallel dispatch over SharedArrayBuffer).
 *
 * Each tick runs a heavy O(n·K) per-entity kernel (every entity pulled by K
 * attractors). Toggle "Parallel":
 *   - OFF — the kernel runs single-threaded on the main thread; a heavy kernel
 *     makes "sim" dominate the frame and the graph spikes past vsync.
 *   - ON  — the kernel is split across workers that read/write the *shared*
 *     Position columns (SharedArrayBuffer, no copy). The main thread dispatches
 *     and renders without blocking, so it stays smooth, and "sim" (worker
 *     wall-time) drops ~cores× for a heavy kernel.
 *
 * Parallel needs cross-origin isolation (SharedArrayBuffer). The example's dev
 * server sets COOP/COEP headers; loaded via the hub (no headers) the toggle is
 * disabled and it runs single-threaded.
 */

const W = 800;
const H = 600;
const STEP = 6; // px/s pull toward the net attractor direction
const HISTORY = W;
const ISOLATED = typeof SharedArrayBuffer !== 'undefined';
const CORES = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));

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
  px: Float32Array;
  pxBuf: ArrayBufferLike;
  py: Float32Array;
  pyBuf: ArrayBufferLike;
}

function makeSim(count: number, attractorCount: number, shared: boolean): Sim {
  const world = new EcsWorld();
  world.registerComponent(PositionDef, { shared });
  const store = world.getStore(PositionDef);
  for (let i = 0; i < count; i++) {
    const id = world.createEntity();
    store.set(id, { x: Math.random() * W, y: Math.random() * H });
  }
  const col = world.getColumnStore(PositionDef);
  const px = col.column('x') as Float32Array;
  const py = col.column('y') as Float32Array;
  const ax = new Float32Array(attractorCount);
  const ay = new Float32Array(attractorCount);
  for (let k = 0; k < attractorCount; k++) {
    const a = (k / attractorCount) * Math.PI * 2;
    ax[k] = W / 2 + Math.cos(a) * (W * 0.35);
    ay[k] = H / 2 + Math.sin(a) * (H * 0.35);
  }
  return { attractorCount, ax, ay, count, px, pxBuf: px.buffer, py, pyBuf: py.buffer };
}

function stepSingle(sim: Sim, dt: number): void {
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

function ranges(count: number, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const per = Math.ceil(count / n);
  for (let i = 0; i < n; i++) out.push([Math.min(i * per, count), Math.min((i + 1) * per, count)]);
  return out;
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
    el.style.width = '160px';
    const text = document.createElement('span');
    text.style.cssText = 'min-width:60px;font-variant-numeric:tabular-nums';
    wrapEl.append(`${label}:`, el, text);
    controls.append(wrapEl);
    return { el, text };
  };

  const count = mkSlider('Entities', 10000, 1000000, 10000, 100000);
  const kernel = mkSlider('Kernel K', 1, 64, 1, 8);

  const parLabel = document.createElement('label');
  parLabel.style.cssText = 'font:13px system-ui;display:flex;gap:6px;align-items:center;cursor:pointer';
  const parBox = document.createElement('input');
  parBox.type = 'checkbox';
  parBox.disabled = !ISOLATED;
  parLabel.append(parBox, ISOLATED ? `Parallel (${CORES} workers)` : 'Parallel (needs COOP/COEP — run standalone)');
  controls.append(parLabel);

  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:100%';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = 'display:block;background:#0b0f14;width:100%';
  const ctx = canvas.getContext('2d')!;

  const panel = document.createElement('div');
  panel.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(6,10,15,0.72);border:1px solid #1c2833;border-radius:6px;padding:8px 10px;font:12px/1.6 ui-monospace,monospace;min-width:180px';
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
  const modeV = panelRow('mode');
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
  caption.textContent = 'Raise Entities / Kernel K until the single-threaded sim spikes past vsync, then toggle Parallel: the kernel is split across workers over shared-memory columns, the main thread stops blocking, and the graph flattens. On light kernels the barrier overhead makes parallel slower — the crossover is the point.';

  container.append(controls, stage, graph, caption);

  const img = ctx.createImageData(W, H);
  const pixels = new Uint32Array(img.data.buffer);

  const workers: Worker[] = [];
  if (ISOLATED) {
    for (let i = 0; i < CORES; i++)
      workers.push(new Worker(new URL('./kernel.worker.ts', import.meta.url), { type: 'module' }));
  }

  let doneCount = 0;
  let barrierResolve: (() => void) | null = null;
  for (const w of workers) {
    w.addEventListener('message', (e: MessageEvent) => {
      if ((e.data as { type: string }).type === 'done' && ++doneCount === workers.length && barrierResolve) {
        const r = barrierResolve;
        barrierResolve = null;
        r();
      }
    });
  }

  let sim = makeSim(Number(count.el.value), Number(kernel.el.value), false);
  let workersReady = false;
  let inFlight = false;

  const initWorkers = async (s: Sim): Promise<void> => {
    workersReady = false;
    const rs = ranges(s.count, workers.length);
    await Promise.all(workers.map((w, i) => new Promise<void>((resolve) => {
      const onReady = (e: MessageEvent): void => {
        if ((e.data as { type: string }).type === 'ready') {
          w.removeEventListener('message', onReady);
          resolve();
        }
      };
      w.addEventListener('message', onReady);
      w.postMessage({ ax: s.ax, ay: s.ay, end: rs[i][1], h: H, pxBuf: s.pxBuf, pyBuf: s.pyBuf, start: rs[i][0], step: STEP, type: 'init', w: W });
    })));
    workersReady = true;
  };

  const stepParallel = (dt: number): Promise<void> => new Promise((resolve) => {
    doneCount = 0;
    barrierResolve = resolve;
    for (const w of workers) w.postMessage({ dt, type: 'step' });
  });

  let history: number[] = [];
  let simMsAvg = 0;
  let frameMsAvg = 0;
  let fps = 0;
  let lastFrame = performance.now();
  let refreshMs = 0;
  const calib: number[] = [];

  const fmt = (n: number): string => n.toLocaleString('en-US');
  const rebuild = (): void => {
    const parallel = parBox.checked && ISOLATED;
    sim = makeSim(Number(count.el.value), Number(kernel.el.value), parallel);
    history = [];
    simMsAvg = 0;
    frameMsAvg = 0;
    fps = 0;
    inFlight = false;
    workersReady = false;
    lastFrame = performance.now();
    if (parallel)
      void initWorkers(sim);
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
  parBox.addEventListener('change', rebuild);

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

    const dt = Math.min(frameDelta, 33) / 1000;
    const parallel = parBox.checked && ISOLATED;
    if (parallel) {
      if (workersReady && !inFlight) {
        inFlight = true;
        const t0 = performance.now();
        void stepParallel(dt).then(() => {
          simMsAvg = ema(simMsAvg, performance.now() - t0);
          inFlight = false;
        });
      }
    }
    else {
      const t0 = performance.now();
      stepSingle(sim, dt);
      simMsAvg = ema(simMsAvg, performance.now() - t0);
    }

    frameMsAvg = ema(frameMsAvg, frameDelta);
    pixels.fill(BG);
    const { count: n, px, py } = sim;
    for (let s = 0; s < n; s++) {
      const x = px[s] | 0;
      const y = py[s] | 0;
      if (x >= 0 && x < W && y >= 0 && y < H)
        pixels[y * W + x] = DOT;
    }
    ctx.putImageData(img, 0, 0);
    drawGraph(gctx, history, refreshMs || (1000 / 60));

    fpsV.textContent = fps.toFixed(0);
    frameV.textContent = `${frameMsAvg.toFixed(2)} ms`;
    simV.textContent = `${simMsAvg.toFixed(2)} ms`;
    modeV.textContent = parallel ? `parallel ×${workers.length}` : 'single';
    entV.textContent = fmt(sim.count);
    kV.textContent = String(sim.attractorCount);

    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  return (): void => {
    window.cancelAnimationFrame(rafId);
    for (const w of workers) w.terminate();
    container.innerHTML = '';
  };
}
