/**
 * Web Audio plumbing. Owns the `AudioContext`, a cheap synthesized
 * metronome click, and an `AudioClockTickSource` that derives its
 * `deltaMs` from `audioCtx.currentTime` diffs rather than
 * `performance.now()`.
 *
 * Why this is the point of the prototype: every previous example has
 * implicitly assumed the engine owns the clock. Rhythm inverts that —
 * the audio hardware owns the clock and the engine just has to keep up.
 * If the engine can tick off an external clock cleanly, it can also
 * tick off a networked clock (Rung 9).
 */

import type { TickInfo, TickSource } from '@pierre/ecs';

export class AudioEngine {
  readonly ctx: AudioContext;
  private readonly masterGain: GainNode;

  constructor() {
    const Ctor = (window.AudioContext ?? (window as unknown as {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext);
    if (!Ctor)
      throw new Error('Web Audio API not available');
    this.ctx = new Ctor();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.25;
    this.masterGain.connect(this.ctx.destination);
  }

  dispose(): void {
    void this.ctx.close();
  }

  /** Short blip played when a note is successfully hit. */
  playHitBlip(): void {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 1760;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.3, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(env).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  /** Browsers require a user gesture to start the audio clock. */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running')
      await this.ctx.resume();
  }

  /**
   * Schedule a short metronome click at the given audio-clock time.
   * Beat-1 of every bar gets a higher pitch to mark the downbeat.
   */
  scheduleClick(audioTimeS: number, accent: boolean): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = accent ? 1320 : 880;
    env.gain.value = 0;
    const t = Math.max(audioTimeS, this.ctx.currentTime);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(accent ? 0.9 : 0.5, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(env).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }
}

/**
 * Variable-rate tick source driven by `requestAnimationFrame` but
 * measuring time against `audioCtx.currentTime` rather than
 * `performance.now()`. Emits `TickInfo { kind: 'variable', deltaMs }`
 * where `deltaMs` is the delta between audio-clock samples.
 *
 * Consumers read `audioCtx.currentTime` directly when they need the
 * absolute beat time for hit judgement — the tick delta is only used
 * for scroll interpolation.
 */
export class AudioClockTickSource implements TickSource {
  private readonly audioCtx: AudioContext;
  private cancelRaf: (id: number) => void;
  private readonly handlers = new Set<(info: TickInfo) => void>();
  private lastAudioTimeS = -1;
  private nextTickNumber = 0;
  private raf: (cb: FrameRequestCallback) => number;

  private rafHandle: number | null = null;

  private readonly step = (): void => {
    const t = this.audioCtx.currentTime;
    const deltaMs = this.lastAudioTimeS < 0 ? 0 : (t - this.lastAudioTimeS) * 1000;
    this.lastAudioTimeS = t;
    const info: TickInfo = {
      deltaMs,
      kind: 'variable',
      tickNumber: this.nextTickNumber++,
    };
    for (const h of this.handlers) {
      try {
        h(info);
      }
      catch (err) {
        console.error('AudioClockTickSource: subscriber threw', err);
      }
    }
    if (this.rafHandle !== null)
      this.rafHandle = this.raf(this.step);
  };

  constructor(audioCtx: AudioContext) {
    this.audioCtx = audioCtx;
    this.raf = window.requestAnimationFrame.bind(window);
    this.cancelRaf = window.cancelAnimationFrame.bind(window);
  }

  start(): void {
    if (this.rafHandle !== null)
      return;
    this.rafHandle = this.raf(this.step);
  }

  stop(): void {
    if (this.rafHandle === null)
      return;
    this.cancelRaf(this.rafHandle);
    this.rafHandle = null;
    this.lastAudioTimeS = -1;
  }

  subscribe(handler: (info: TickInfo) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
