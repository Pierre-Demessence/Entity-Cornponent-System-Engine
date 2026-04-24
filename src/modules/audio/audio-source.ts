import type { ComponentDef } from '#component-store';

import { asBoolean, asNumber, asObject, asString } from '#validation';

export interface AudioSource {
  channel?: string;
  clipId: string;
  loop?: boolean;
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

export const AudioSourceDef: ComponentDef<AudioSource> = {
  name: 'audioSource',
  deserialize: (raw, label) => {
    const obj = asObject(raw, label);
    const clipId = validateClipId(asString(obj.clipId, `${label}.clipId`), label);
    const channel = validateChannel(parseOptionalString(obj.channel, 'channel', label), label);
    const loop = parseOptionalBoolean(obj.loop, 'loop', label);
    const volume = validateVolume(parseOptionalNumber(obj.volume, 'volume', label), label);

    return {
      channel,
      clipId,
      loop,
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
    return out;
  },
};
