/** Opaque handle to one active playback, returned by {@link AudioProvider.play} and passed to `stop`. */
export type AudioHandle = string;

/** Per-playback options: target `channel`, start `delayMs`, `loop`, and `volume`. */
export interface AudioPlayOptions {
  channel?: string;
  delayMs?: number;
  loop?: boolean;
  volume?: number;
}

/**
 * The audio backend a game supplies: play/stop clips, set per-channel volume,
 * and dispose. `modules/audio` ships a Web Audio implementation.
 */
export interface AudioProvider {
  dispose: () => void;
  play: (clipId: string, options?: AudioPlayOptions) => AudioHandle;
  setVolume: (channel: string, value: number) => void;
  stop: (handle: AudioHandle) => void;
}
