import type { AudioHandle, AudioPlayOptions, AudioProvider } from '#audio-provider';

interface AudioContextCtor {
  new (): AudioContext;
}

interface ActiveSource {
  source: AudioBufferSourceNode;
  voiceGain: GainNode;
}

function clamp01(value: number, label: string): number {
  if (!Number.isFinite(value))
    throw new Error(`${label} must be finite.`);
  if (value < 0 || value > 1)
    throw new Error(`${label} must be in [0, 1].`);
  return value;
}

function parseDelayMs(value: number | undefined): number {
  if (value === undefined)
    return 0;
  if (!Number.isFinite(value))
    throw new Error('WebAudioProvider.play.delayMs must be finite when provided.');
  return Math.max(0, value);
}

function validateClipId(clipId: string): string {
  if (clipId.trim().length === 0)
    throw new Error('WebAudioProvider: clipId must not be empty.');
  return clipId;
}

function normalizeChannel(channel: string | undefined): string {
  if (channel === undefined)
    return 'master';
  if (channel.trim().length === 0)
    throw new Error('WebAudioProvider: channel must not be empty when provided.');
  return channel;
}

function resolveAudioContextCtor(): AudioContextCtor | null {
  const globalRef = globalThis as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return globalRef.AudioContext ?? globalRef.webkitAudioContext ?? null;
}

export interface WebAudioProviderOptions {
  clips?: ReadonlyMap<string, AudioBuffer> | Readonly<Record<string, AudioBuffer>>;
  context?: AudioContext;
  masterVolume?: number;
  resolveClip?: (clipId: string, context: AudioContext) => AudioBuffer | undefined;
}

export class WebAudioProvider implements AudioProvider {
  private readonly active = new Map<AudioHandle, ActiveSource>();
  private readonly channelGains = new Map<string, GainNode>();
  private readonly clips: ReadonlyMap<string, AudioBuffer>;
  private readonly context: AudioContext;
  private disposed = false;
  private readonly master: GainNode;
  private nextHandle = 1;
  private readonly ownsContext: boolean;
  private readonly resolveClip?: (clipId: string, context: AudioContext) => AudioBuffer | undefined;

  constructor(options: WebAudioProviderOptions = {}) {
    const Ctor = resolveAudioContextCtor();
    const context = options.context ?? (Ctor ? new Ctor() : null);
    if (!context) {
      throw new Error(
        'WebAudioProvider: no AudioContext available. Pass options.context '
        + 'explicitly when running outside a browser.',
      );
    }

    this.context = context;
    this.ownsContext = options.context === undefined;
    this.resolveClip = options.resolveClip;
    this.clips = options.clips instanceof Map
      ? options.clips
      : new Map(Object.entries(options.clips ?? {}));

    this.master = this.context.createGain();
    this.master.gain.value = clamp01(options.masterVolume ?? 1, 'WebAudioProvider.masterVolume');
    this.master.connect(this.context.destination);
  }

  dispose(): void {
    if (this.disposed)
      return;
    this.disposed = true;

    for (const handle of Array.from(this.active.keys())) {
      this.stop(handle);
    }
    for (const gain of this.channelGains.values()) {
      gain.disconnect();
    }
    this.channelGains.clear();
    this.master.disconnect();
    if (this.ownsContext)
      void this.context.close().catch(() => undefined);
  }

  private getChannelNode(name: string): GainNode {
    if (name === 'master')
      return this.master;

    const existing = this.channelGains.get(name);
    if (existing)
      return existing;

    const gain = this.context.createGain();
    gain.gain.value = 1;
    gain.connect(this.master);
    this.channelGains.set(name, gain);
    return gain;
  }

  play(clipId: string, options: AudioPlayOptions = {}): AudioHandle {
    const safeClipId = validateClipId(clipId);
    const clip = this.resolveClip?.(safeClipId, this.context) ?? this.clips.get(safeClipId);
    if (!clip) {
      throw new Error(`WebAudioProvider: unknown clip id "${safeClipId}".`);
    }

    const channel = normalizeChannel(options.channel);
    const when = this.context.currentTime + parseDelayMs(options.delayMs) / 1000;
    const source = this.context.createBufferSource();
    source.buffer = clip;
    source.loop = options.loop ?? false;

    const voiceGain = this.context.createGain();
    voiceGain.gain.value = clamp01(options.volume ?? 1, 'WebAudioProvider.play.volume');

    source.connect(voiceGain);
    voiceGain.connect(this.getChannelNode(channel));

    const handle = `a${this.nextHandle++}`;
    this.active.set(handle, { source, voiceGain });

    source.onended = () => {
      this.release(handle);
    };

    source.start(when);
    return handle;
  }

  private release(handle: AudioHandle): void {
    const entry = this.active.get(handle);
    if (!entry)
      return;
    this.active.delete(handle);
    entry.source.disconnect();
    entry.voiceGain.disconnect();
  }

  setVolume(channel: string, value: number): void {
    const channelName = normalizeChannel(channel);
    const node = this.getChannelNode(channelName);
    node.gain.value = clamp01(value, `WebAudioProvider.setVolume(${channelName})`);
  }

  stop(handle: AudioHandle): void {
    const entry = this.active.get(handle);
    if (!entry)
      return;
    try {
      entry.source.stop();
    }
    catch {
      // Ignore InvalidStateError if already ended.
    }
    this.release(handle);
  }
}
