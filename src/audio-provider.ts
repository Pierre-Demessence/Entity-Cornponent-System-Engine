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
 * retune an active playback (for spatial attenuation/pan), and dispose.
 * `modules/audio` ships a Web Audio implementation.
 */
export interface AudioProvider {
  dispose: () => void;
  play: (clipId: string, options?: AudioPlayOptions) => AudioHandle;
  /** Set the stereo pan of one active playback, in `[-1, 1]`. Unknown handles are ignored. */
  setPlaybackPan: (handle: AudioHandle, value: number) => void;
  /** Set the volume of one active playback, in `[0, 1]`. Unknown handles are ignored. */
  setPlaybackVolume: (handle: AudioHandle, value: number) => void;
  setVolume: (channel: string, value: number) => void;
  stop: (handle: AudioHandle) => void;
}
