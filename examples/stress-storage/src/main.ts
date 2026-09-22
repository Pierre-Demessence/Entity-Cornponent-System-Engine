import { EcsWorld } from '@pierre/ecs';
import { PositionDef, VelocityDef } from '@pierre/ecs/modules/transform';

/**
 * Storage stress harness — a live demo (and regression check) of the engine's
 * columnar storage (docs/plans/ecs-parallelism-and-soa-storage.md, target
 * "Middle").
 *
 * Runs the *same* trivial simulation (integrate position by velocity, wrap at
 * the edges) over N entities two ways, toggled by a checkbox:
 *   - Engine columnar — the real engine: EcsWorld + PositionDef/VelocityDef,
 *     which are all-numeric so they get Structure-of-Arrays storage. The loop
 *     reads/writes the typed-array columns directly via world.getColumnStore().
 *   - Naive objects — throwaway baseline: an array of `{x,y}` / `{vx,vy}` heap
 *     objects (what the object-backed Map store costs), one plain loop.
 *
 * The headline number is simulation ms/tick (render is excluded from the timing
 * and kept O(n) via a single ImageData). Crank the slider until the object
 * baseline drops below the frame budget while the engine's columns stay flat —
 * that gap, plus the GC sawtooth on the object side, is the win the columnar
 * storage delivers.
 */

const W = 800;
const H = 600;
const SPEED = 60; // px/s
const DT_MS = 1000 / 60;
const HISTORY = W; // one sample per pixel column

const BG = rgba(11, 15, 20);
const DOT_ECS = rgba(127, 212, 255);
const DOT_SOA = rgba(150, 230, 140);

interface Backend {
  readonly dotColor: number;
  readonly label: string;
  draw: (pixels: Uint32Array) => void;
  step: (dtMs: number) => void;
}

function rgba(r: number, g: number, b: number): number {
  return ((0xFF << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}
// Single-step toroidal wrap. Valid because movement per tick << playfield size;
// compare-and-subtract is ~2-3x cheaper than the double-modulo `((v%m)+m)%m`.
function wrap(v: number, max: number): number {
  if (v < 0)
    return v + max;
  if (v >= max)
    return v - max;
  return v;
}
function makeEngineBackend(n: number): Backend {
  const world = new EcsWorld();
  world.registerComponent(PositionDef);
  world.registerComponent(VelocityDef);
  for (let i = 0; i < n; i++) {
    const id = world.createEntity();
    const a = Math.random() * Math.PI * 2;
    world.getStore(PositionDef).set(id, { x: Math.random() * W, y: Math.random() * H });
    world.getStore(VelocityDef).set(id, { vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED });
  }
  // Spawned pos-then-vel in id order with no deletes, so both columnar stores
  // are dense and aligned: slot i is entity i in each. Read the columns directly.
  const pos = world.getColumnStore(PositionDef);
  const vel = world.getColumnStore(VelocityDef);
  const px = pos.column('x');
  const py = pos.column('y');
  const vx = vel.column('vx');
  const vy = vel.column('vy');
  return {
    dotColor: DOT_SOA,
    label: 'Engine columnar (SoA)',
    draw(pixels) {
      for (let i = 0; i < n; i++) {
        const x = px[i] | 0;
        const y = py[i] | 0;
        if (x >= 0 && x < W && y >= 0 && y < H)
          pixels[y * W + x] = DOT_SOA;
      }
    },
    step(dtMs) {
      const dt = dtMs / 1000;
      for (let i = 0; i < n; i++) {
        px[i] = wrap(px[i] + vx[i] * dt, W);
        py[i] = wrap(py[i] + vy[i] * dt, H);
      }
    },
  };
}

function makeBareBackend(n: number): Backend {
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const vxs = new Float32Array(n);
  const vys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    xs[i] = Math.random() * W;
    ys[i] = Math.random() * H;
    vxs[i] = Math.cos(a) * SPEED;
    vys[i] = Math.sin(a) * SPEED;
  }
  return {
    dotColor: DOT_SOA,
    label: 'Bare typed arrays (floor)',
    draw(pixels) {
      for (let i = 0; i < n; i++) {
        const x = xs[i] | 0;
        const y = ys[i] | 0;
        if (x >= 0 && x < W && y >= 0 && y < H)
          pixels[y * W + x] = DOT_SOA;
      }
    },
    step(dtMs) {
      const dt = dtMs / 1000;
      for (let i = 0; i < n; i++) {
        xs[i] = wrap(xs[i] + vxs[i] * dt, W);
        ys[i] = wrap(ys[i] + vys[i] * dt, H);
      }
    },
  };
}

interface Obj2 { x: number; y: number }
interface ObjVel { vx: number; vy: number }

function makeMapBackend(n: number): Backend {
  const pos: Obj2[] = Array.from({ length: n });
  const vel: ObjVel[] = Array.from({ length: n });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    pos[i] = { x: Math.random() * W, y: Math.random() * H };
    vel[i] = { vx: Math.cos(a) * SPEED, vy: Math.sin(a) * SPEED };
  }
  return {
    dotColor: DOT_ECS,
    label: 'Naive objects (Map-style)',
    draw(pixels) {
      for (let i = 0; i < n; i++) {
        const p = pos[i];
        const x = p.x | 0;
        const y = p.y | 0;
        if (x >= 0 && x < W && y >= 0 && y < H)
          pixels[y * W + x] = DOT_ECS;
      }
    },
    step(dtMs) {
      const dt = dtMs / 1000;
      for (let i = 0; i < n; i++) {
        const p = pos[i];
        const v = vel[i];
        p.x = wrap(p.x + v.vx * dt, W);
        p.y = wrap(p.y + v.vy * dt, H);
      }
    },
  };
}

function drawGraph(
  gctx: CanvasRenderingContext2D,
  history: number[],
  budgetMs: number,
): void {
  const gw = W;
  const gh = 120;
  gctx.fillStyle = '#0e141c';
  gctx.fillRect(0, 0, gw, gh);

  let observedMax = budgetMs * 2;
  for (const ms of history) {
    if (ms > observedMax)
      observedMax = ms;
  }
  const maxMs = observedMax * 1.1;
  const yOf = (ms: number): number => gh - (ms / maxMs) * gh;

  gctx.strokeStyle = 'rgba(120, 220, 140, 0.5)';
  gctx.lineWidth = 1;
  gctx.beginPath();
  gctx.moveTo(0, yOf(budgetMs));
  gctx.lineTo(gw, yOf(budgetMs));
  gctx.stroke();
  gctx.fillStyle = 'rgba(120, 220, 140, 0.8)';
  gctx.font = '11px system-ui';
  gctx.fillText(`${budgetMs.toFixed(1)} ms (vsync / refresh)`, 6, yOf(budgetMs) - 4);

  gctx.strokeStyle = '#7fd4ff';
  gctx.lineWidth = 1.5;
  gctx.beginPath();
  const start = Math.max(0, history.length - gw);
  for (let i = start; i < history.length; i++) {
    const x = i - start;
    const y = yOf(history[i]);
    if (i === start) {
      gctx.moveTo(x, y);
    }
    else {
      gctx.lineTo(x, y);
    }
  }
  gctx.stroke();
}

export function start(container: HTMLElement): () => void {
  container.innerHTML = '';

  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:16px;align-items:center;padding:8px 0;flex-wrap:wrap';

  const countLabel = document.createElement('label');
  countLabel.style.cssText = 'font:13px system-ui;display:flex;gap:8px;align-items:center';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '1000';
  slider.max = '10000000';
  slider.step = '1000';
  slider.value = '20000';
  slider.style.width = '260px';
  const countText = document.createElement('span');
  countText.style.cssText = 'min-width:96px;font-variant-numeric:tabular-nums';
  countLabel.append('Entities:', slider, countText);

  const storageLabel = document.createElement('label');
  storageLabel.style.cssText = 'font:13px system-ui;display:flex;gap:6px;align-items:center';
  const storageSel = document.createElement('select');
  storageSel.style.cssText = 'font:13px system-ui;padding:2px 6px';
  for (const [value, text] of [
    ['engine', 'Engine columnar (SoA)'],
    ['objects', 'Naive objects (Map-style)'],
    ['bare', 'Bare typed arrays (floor)'],
  ] as [string, string][]) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = text;
    storageSel.append(opt);
  }
  storageLabel.append('Storage:', storageSel);

  controls.append(countLabel, storageLabel);

  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:100%';

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.cssText = 'display:block;background:#0b0f14;width:100%';
  const ctx = canvas.getContext('2d')!;

  const panel = document.createElement('div');
  panel.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(6,10,15,0.72);border:1px solid #1c2833;border-radius:6px;padding:8px 10px;font:12px/1.6 ui-monospace,monospace;min-width:160px';
  const modeEl = document.createElement('div');
  modeEl.style.cssText = 'font-weight:600;margin-bottom:4px;color:#7fd4ff';
  panel.append(modeEl);
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
  const simV = panelRow('sim');
  const renderV = panelRow('render');
  const peakV = panelRow('peak');
  const entV = panelRow('entities');
  const vsyncV = panelRow('vsync');
  stage.append(canvas, panel);

  const graph = document.createElement('canvas');
  graph.width = W;
  graph.height = 120;
  graph.style.cssText = 'display:block;width:100%;margin-top:8px';
  const gctx = graph.getContext('2d')!;

  const caption = document.createElement('div');
  caption.style.cssText = 'padding:8px 0;font:12px system-ui;color:#6f8296';
  caption.textContent = 'Same simulation, two storage layouts. "sim" is the isolated storage cost (the B1 signal) — raise the count and watch it climb + sawtooth for the Map store while SoA stays flat. "render" is the per-entity draw loop (a separate bottleneck SoA does not fix). The graph plots total frame time against your measured vsync interval — when it pokes above the line, that is the FPS drop.';

  container.append(controls, stage, graph, caption);

  const img = ctx.createImageData(W, H);
  const pixels = new Uint32Array(img.data.buffer);

  let count = Number(slider.value);
  let backend: Backend = makeEngineBackend(count); // replaced immediately in rebuild()
  let frameHistory: number[] = [];
  let simMsAvg = 0;
  let renderMsAvg = 0;
  let frameMsAvg = 0;
  let lastFrame = performance.now();
  let fps = 0;
  // Display vsync interval, calibrated once from the median of early frames
  // (steady state = vsync-locked). Persisted across rebuilds; 0 until ready.
  let refreshMs = 0;
  const calib: number[] = [];

  const rebuild = (): void => {
    count = Number(slider.value);
    backend = storageSel.value === 'objects'
      ? makeMapBackend(count)
      : storageSel.value === 'bare'
        ? makeBareBackend(count)
        : makeEngineBackend(count);
    frameHistory = [];
    simMsAvg = 0;
    renderMsAvg = 0;
    frameMsAvg = 0;
    // Don't fold the synchronous rebuild freeze (spawning millions) into the
    // fps/frame EMAs — reset the clock so measurement resumes clean.
    fps = 0;
    lastFrame = performance.now();
  };

  const fmtCount = (n: number): string => n.toLocaleString('en-US');
  slider.addEventListener('input', () => {
    countText.textContent = fmtCount(Number(slider.value));
  });
  slider.addEventListener('change', rebuild);
  storageSel.addEventListener('change', rebuild);
  countText.textContent = fmtCount(count);
  rebuild();

  const ema = (avg: number, sample: number): number =>
    avg === 0 ? sample : avg * 0.9 + sample * 0.1;

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

    const t0 = performance.now();
    backend.step(DT_MS);
    const simMs = performance.now() - t0;

    const t1 = performance.now();
    pixels.fill(BG);
    backend.draw(pixels);
    ctx.putImageData(img, 0, 0);
    const renderMs = performance.now() - t1;

    simMsAvg = ema(simMsAvg, simMs);
    renderMsAvg = ema(renderMsAvg, renderMs);
    frameMsAvg = ema(frameMsAvg, frameDelta);
    frameHistory.push(frameDelta);
    if (frameHistory.length > HISTORY)
      frameHistory.shift();

    const budget = refreshMs || DT_MS;
    drawGraph(gctx, frameHistory, budget);

    let framePeak = 0;
    for (const ms of frameHistory) {
      if (ms > framePeak)
        framePeak = ms;
    }
    modeEl.textContent = backend.label;
    fpsV.textContent = fps.toFixed(0);
    frameV.textContent = `${frameMsAvg.toFixed(2)} ms`;
    simV.textContent = `${simMsAvg.toFixed(2)} ms`;
    renderV.textContent = `${renderMsAvg.toFixed(2)} ms`;
    peakV.textContent = `${framePeak.toFixed(1)} ms`;
    entV.textContent = fmtCount(count);
    vsyncV.textContent = `${budget.toFixed(1)} ms`;

    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  return (): void => {
    window.cancelAnimationFrame(rafId);
    container.innerHTML = '';
  };
}
