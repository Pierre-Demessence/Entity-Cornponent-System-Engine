export const CLIP = {
  death: 'death',
  extra: 'extra',
  fruit: 'fruit',
  ghost: 'ghost',
  power: 'power',
  wakaA: 'waka-a',
  wakaB: 'waka-b',
  win: 'win',
} as const;

type Wave = (phase: number) => number;

const square: Wave = p => (p % 1 < 0.5 ? 1 : -1);
const triangle: Wave = p => 1 - 4 * Math.abs((p % 1) - 0.5);

/**
 * Renders one sound: `freq(t)` gives the pitch in Hz at `t` seconds, and the
 * phase is integrated so a sweep stays continuous instead of clicking.
 */
function tone(ctx: AudioContext, seconds: number, freq: (t: number) => number, wave: Wave, volume = 0.25): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    phase += freq(t) / ctx.sampleRate;
    const fade = Math.min(1, (seconds - t) * 30, t * 400);
    data[i] = wave(phase) * volume * fade;
  }
  return buffer;
}

/** Notes played back to back, each `note` seconds long, as one buffer. */
function melody(ctx: AudioContext, notes: readonly number[], note: number, wave: Wave): AudioBuffer {
  const per = Math.ceil(note * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, per * notes.length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  notes.forEach((hz, n) => {
    for (let i = 0; i < per; i++) {
      const t = i / ctx.sampleRate;
      const fade = Math.min(1, (note - t) * 40, t * 400);
      data[n * per + i] = hz === 0 ? 0 : wave(hz * t) * 0.2 * fade;
    }
  });
  return buffer;
}

/** Every sound effect, synthesised in code so the example ships no audio files. */
export function synthClips(ctx: AudioContext): Record<string, AudioBuffer> {
  return {
    [CLIP.death]: tone(ctx, 1.4, t => 900 * (1 - t / 1.5) + 40 * Math.sin(t * 40), triangle, 0.35),
    [CLIP.extra]: melody(ctx, [880, 1175, 1568], 0.09, square),
    [CLIP.fruit]: melody(ctx, [660, 990], 0.08, triangle),
    [CLIP.ghost]: tone(ctx, 0.28, t => 220 + 3600 * t, square, 0.2),
    [CLIP.power]: tone(ctx, 0.5, t => 180 + 60 * Math.sin(t * 60), triangle, 0.3),
    [CLIP.wakaA]: tone(ctx, 0.09, t => 240 + 2800 * t, triangle),
    [CLIP.wakaB]: tone(ctx, 0.09, t => 520 - 2800 * t, triangle),
    [CLIP.win]: melody(ctx, [523, 659, 784, 1047, 0, 784, 1047], 0.11, square),
  };
}
