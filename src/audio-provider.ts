export type AudioHandle = string;

export interface AudioPlayOptions {
  channel?: string;
  delayMs?: number;
  loop?: boolean;
  volume?: number;
}

export interface AudioProvider {
  dispose: () => void;
  play: (clipId: string, options?: AudioPlayOptions) => AudioHandle;
  setVolume: (channel: string, value: number) => void;
  stop: (handle: AudioHandle) => void;
}
