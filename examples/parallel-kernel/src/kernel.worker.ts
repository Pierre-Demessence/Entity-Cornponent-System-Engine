/**
 * Kernel worker for the parallel-kernel harness. Owns a fixed slot range and
 * runs the attractor kernel over the *shared* Position columns (SharedArrayBuffer
 * views), so no data is copied per tick — the whole point of step B2. Ranges are
 * disjoint across workers, so concurrent writes never overlap.
 */

interface InitMsg {
  ax: Float32Array;
  ay: Float32Array;
  end: number;
  h: number;
  pxBuf: SharedArrayBuffer;
  pyBuf: SharedArrayBuffer;
  start: number;
  step: number;
  type: 'init';
  w: number;
}
interface StepMsg { dt: number; type: 'step' }

const ctx = globalThis as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};

let px: Float32Array<ArrayBufferLike> = new Float32Array(0);
let py: Float32Array<ArrayBufferLike> = new Float32Array(0);
let ax: Float32Array<ArrayBufferLike> = new Float32Array(0);
let ay: Float32Array<ArrayBufferLike> = new Float32Array(0);
let w = 0;
let h = 0;
let step = 0;
let start = 0;
let end = 0;

function wrap(v: number, max: number): number {
  if (v < 0)
    return v + max;
  if (v >= max)
    return v - max;
  return v;
}

ctx.onmessage = (e): void => {
  const msg = e.data as InitMsg | StepMsg;
  if (msg.type === 'init') {
    px = new Float32Array(msg.pxBuf);
    py = new Float32Array(msg.pyBuf);
    ax = msg.ax;
    ay = msg.ay;
    w = msg.w;
    h = msg.h;
    step = msg.step;
    start = msg.start;
    end = msg.end;
    ctx.postMessage({ type: 'ready' });
    return;
  }
  const K = ax.length;
  const pull = step * msg.dt;
  for (let s = start; s < end; s++) {
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
    px[s] = wrap(x + fx * pull, w);
    py[s] = wrap(y + fy * pull, h);
  }
  ctx.postMessage({ type: 'done' });
};
