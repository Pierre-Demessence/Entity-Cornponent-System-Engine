import type { ComponentDef } from '#component-store';

import { asBoolean, asNumber, asObject, asString } from '#validation';

/**
 * Spatial placement for an `AudioSource`: a world `x`/`y` position plus optional
 * inverse-distance falloff tuning (`refDistance`, `maxDistance`, `rolloff`). Its
 * presence marks the source as positioned; absent means non-spatial.
 */
export interface AudioSpatial {
  /** Distance at which attenuation stops decreasing. Defaults via the system. */
  maxDistance?: number;
  /** Distance within which the source plays at full volume. Defaults via the system. */
  refDistance?: number;
  /** How quickly volume falls off past `refDistance`. Defaults via the system. */
  rolloff?: number;
  x: number;
  y: number;
}

/** Audio-source component: the `clipId` to play, plus optional `channel`, `loop`, `volume`, and `spatial` placement. */
export interface AudioSource {
  channel?: string;
  clipId: string;
  loop?: boolean;
  spatial?: AudioSpatial;
  volume?: number;
}

function parseOptionalBoolean(
  raw: unknown,
  key: string,
  label: string,
): boolean | undefined {
  if (raw === undefined)
    return undefined;
  return asBoolean(raw, `${label}.${key}`);
}

function parseOptionalNumber(
  raw: unknown,
  key: string,
  label: string,
): number | undefined {
  if (raw === undefined)
    return undefined;
  return asNumber(raw, `${label}.${key}`);
}

function parseOptionalString(
  raw: unknown,
  key: string,
  label: string,
): string | undefined {
  if (raw === undefined)
    return undefined;
  return asString(raw, `${label}.${key}`);
}

function validateChannel(channel: string | undefined, label: string): string | undefined {
  if (channel === undefined)
    return undefined;
  if (channel.trim().length === 0)
    throw new Error(`${label}.channel must not be empty when provided.`);
  return channel;
}

function validateClipId(clipId: string, label: string): string {
  if (clipId.trim().length === 0)
    throw new Error(`${label}.clipId must not be empty.`);
  return clipId;
}

function validateVolume(volume: number | undefined, label: string): number | undefined {
  if (volume === undefined)
    return undefined;
  if (volume < 0 || volume > 1)
    throw new Error(`${label}.volume must be in [0, 1].`);
  return volume;
}

function asFiniteNumber(raw: unknown, label: string): number {
  const value = asNumber(raw, label);
  if (!Number.isFinite(value))
    throw new Error(`${label} must be finite.`);
  return value;
}

function parseOptionalPositive(raw: unknown, key: string, label: string): number | undefined {
  if (raw === undefined)
    return undefined;
  const value = asFiniteNumber(raw, `${label}.${key}`);
  if (value <= 0)
    throw new Error(`${label}.${key} must be positive.`);
  return value;
}

function parseSpatial(raw: unknown, label: string): AudioSpatial | undefined {
  if (raw === undefined)
    return undefined;
  const spatialLabel = `${label}.spatial`;
  const obj = asObject(raw, spatialLabel);
  const x = asFiniteNumber(obj.x, `${spatialLabel}.x`);
  const y = asFiniteNumber(obj.y, `${spatialLabel}.y`);
  const refDistance = parseOptionalPositive(obj.refDistance, 'refDistance', spatialLabel);
  const maxDistance = parseOptionalPositive(obj.maxDistance, 'maxDistance', spatialLabel);
  if (refDistance !== undefined && maxDistance !== undefined && maxDistance < refDistance)
    throw new Error(`${spatialLabel}.maxDistance must be greater than or equal to refDistance.`);
  let rolloff: number | undefined;
  if (obj.rolloff !== undefined) {
    rolloff = asFiniteNumber(obj.rolloff, `${spatialLabel}.rolloff`);
    if (rolloff < 0)
      throw new Error(`${spatialLabel}.rolloff must be greater than or equal to 0.`);
  }
  return { maxDistance, refDistance, rolloff, x, y };
}

export const AudioSourceDef: ComponentDef<AudioSource> = {
  name: 'audioSource',
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    const clipId = validateClipId(asString(obj.clipId, `${label}.clipId`), label);
    const channel = validateChannel(parseOptionalString(obj.channel, 'channel', label), label);
    const loop = parseOptionalBoolean(obj.loop, 'loop', label);
    const volume = validateVolume(parseOptionalNumber(obj.volume, 'volume', label), label);
    const spatial = parseSpatial(obj.spatial, label);

    return {
      channel,
      clipId,
      loop,
      spatial,
      volume,
    };
  },
  serialize: (value) => {
    const out: Record<string, unknown> = { clipId: value.clipId };
    if (value.channel !== undefined)
      out.channel = value.channel;
    if (value.loop !== undefined)
      out.loop = value.loop;
    if (value.volume !== undefined)
      out.volume = value.volume;
    if (value.spatial !== undefined) {
      const s = value.spatial;
      const spatial: Record<string, unknown> = { x: s.x, y: s.y };
      if (s.refDistance !== undefined)
        spatial.refDistance = s.refDistance;
      if (s.maxDistance !== undefined)
        spatial.maxDistance = s.maxDistance;
      if (s.rolloff !== undefined)
        spatial.rolloff = s.rolloff;
      out.spatial = spatial;
    }
    return out;
  },
};
