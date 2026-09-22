import { WorkerPool } from '@pierre/ecs/modules/worker-pool';

import { heavyJob } from './heavy';

/**
 * Worker-offload harness — evidence for step A (message-passing offload) in
 * docs/plans/ecs-parallelism-and-soa-storage.md.
 *
 * A field of dots drifts smoothly on the main thread's rAF loop. A button runs
 * a heavy, CPU-bound job (tunable). Toggle "Run in worker":
 *   - OFF — the job runs on the main thread and **freezes** the whole page for
 *     its duration; the dots stutter/jump and the frame-time graph spikes.
 *   - ON  — the job runs in a Web Worker; the dots keep drifting smoothly and
 *     the result arrives asynchronously, no spike.
 *
 * The win here is *smoothness* (no frame stall), not throughput — so the story
 * is the vanishing spike in the frame-time graph, not the average fps.
 */

const W = 800;
const H = 380;
const DOT_COUNT = 220;
const SPEED = 90; // px/s
const HISTORY = W;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
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

  const pool = new WorkerPool<number, number>(
    () => new Worker(new URL('./heavy.worker.ts', import.meta.url), { type: 'module' }),
    { size: 1 },
  );

  // Controls
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex;gap:16px;align-items:center;padding:8px 0;flex-wrap:wrap';

  const jobLabel = document.createElement('label');
  jobLabel.style.cssText = 'font:13px system-ui;display:flex;gap:8px;align-items:center';
  const jobSlider = document.createElement('input');
  jobSlider.type = 'range';
  jobSlider.min = '10000000';
  jobSlider.max = '500000000';
  jobSlider.step = '10000000';
  jobSlider.value = '150000000';
  jobSlider.style.width = '220px';
  const jobText = document.createElement('span');
  jobText.style.cssText = 'min-width:60px;font-variant-numeric:tabular-nums';
  jobLabel.append('Job size:', jobSlider, jobText);

  const workerLabel = document.createElement('label');
  workerLabel.style.cssText = 'font:13px system-ui;display:flex;gap:6px;align-items:center;cursor:pointer';
  const workerBox = document.createElement('input');
  workerBox.type = 'checkbox';
  workerLabel.append(workerBox, 'Run in worker');

  const runBtn = document.createElement('button');
  runBtn.textContent = 'Run job';
  runBtn.style.cssText = 'font:13px system-ui;padding:4px 12px;cursor:pointer';

  controls.append(jobLabel, workerLabel, runBtn);

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
  const peakV = panelRow('peak');
  const jobV = panelRow('last job');
  const whereV = panelRow('ran on');
  stage.append(canvas, panel);

  const graph = document.createElement('canvas');
  graph.width = W;
  graph.height = 120;
  graph.style.cssText = 'display:block;width:100%;margin-top:8px';
  const gctx = graph.getContext('2d')!;

  const caption = document.createElement('div');
  caption.style.cssText = 'padding:8px 0;font:12px system-ui;color:#6f8296';
  caption.textContent = 'Watch the dots and the frame-time graph while you hit "Run job". On the main thread the page freezes and the graph spikes; in the worker the dots keep drifting and the graph stays flat. The win is smoothness (no stall), not fps.';

  container.append(controls, stage, graph, caption);

  // Dots
  const xs = new Float32Array(DOT_COUNT);
  const ys = new Float32Array(DOT_COUNT);
  const vxs = new Float32Array(DOT_COUNT);
  const vys = new Float32Array(DOT_COUNT);
  for (let i = 0; i < DOT_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    xs[i] = Math.random() * W;
    ys[i] = Math.random() * H;
    vxs[i] = Math.cos(a) * SPEED;
    vys[i] = Math.sin(a) * SPEED;
  }

  const fmtMillions = (n: number): string => `${(n / 1_000_000).toFixed(0)}M`;
  jobText.textContent = fmtMillions(Number(jobSlider.value));
  jobSlider.addEventListener('input', () => {
    jobText.textContent = fmtMillions(Number(jobSlider.value));
  });

  let jobMs = 0;
  let ranOn = '—';
  const runJob = (): void => {
    const iters = Number(jobSlider.value);
    if (workerBox.checked) {
      whereV.textContent = 'worker (running…)';
      const t0 = performance.now();
      void pool.run(iters).then(() => {
        jobMs = performance.now() - t0;
        ranOn = 'worker';
      });
    }
    else {
      const t0 = performance.now();
      heavyJob(iters); // blocks the main thread — the whole page freezes here
      jobMs = performance.now() - t0;
      ranOn = 'main (froze)';
    }
  };
  runBtn.addEventListener('click', runJob);

  const history: number[] = [];
  let frameMsAvg = 0;
  let fps = 0;
  let lastFrame = performance.now();
  let refreshMs = 0;
  const calib: number[] = [];

  let rafId = 0;
  const loop = (now: number): void => {
    const frameDelta = now - lastFrame;
    lastFrame = now;
    fps = fps === 0 ? 1000 / frameDelta : fps * 0.9 + (1000 / frameDelta) * 0.1;
    frameMsAvg = frameMsAvg === 0 ? frameDelta : frameMsAvg * 0.9 + frameDelta * 0.1;
    if (refreshMs === 0 && frameDelta > 2 && frameDelta < 100) {
      calib.push(frameDelta);
      if (calib.length >= 60)
        refreshMs = median(calib);
    }
    history.push(frameDelta);
    if (history.length > HISTORY)
      history.shift();

    const dt = frameDelta / 1000;
    for (let i = 0; i < DOT_COUNT; i++) {
      let x = xs[i] + vxs[i] * dt;
      let y = ys[i] + vys[i] * dt;
      if (x < 0 || x > W) {
        vxs[i] = -vxs[i];
        x = xs[i];
      }
      if (y < 0 || y > H) {
        vys[i] = -vys[i];
        y = ys[i];
      }
      xs[i] = x;
      ys[i] = y;
    }

    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#7fd4ff';
    for (let i = 0; i < DOT_COUNT; i++)
      ctx.fillRect(xs[i] - 2, ys[i] - 2, 4, 4);

    drawGraph(gctx, history, refreshMs || (1000 / 60));

    let framePeak = 0;
    for (const ms of history) {
      if (ms > framePeak)
        framePeak = ms;
    }
    fpsV.textContent = fps.toFixed(0);
    frameV.textContent = `${frameMsAvg.toFixed(2)} ms`;
    peakV.textContent = `${framePeak.toFixed(0)} ms`;
    jobV.textContent = jobMs === 0 ? '—' : `${jobMs.toFixed(0)} ms`;
    whereV.textContent = ranOn;

    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  return (): void => {
    window.cancelAnimationFrame(rafId);
    pool.dispose();
    container.innerHTML = '';
  };
}
