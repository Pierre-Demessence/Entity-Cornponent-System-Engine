import type { ComponentDef } from '#index';

import { asNumber, asObject } from '#validation';

/**
 * Per-entity opacity multiplier in [0, 1]. Renderer applies via
 * `globalAlpha`. Canon: Pixi `alpha`, Phaser `alpha`, CSS `opacity`,
 * Unity `CanvasGroup.alpha`, Bevy `Visibility`.
 */
export interface Opacity { value: number }

function validate(raw: unknown, label: string): Opacity {
  const obj = asObject(raw, label);
  const value = asNumber(obj.value, `${label}.value`);
  if (value < 0 || value > 1)
    throw new Error(`${label}.value: expected 0..1, got ${value}`);
  return { value };
}

export const OpacityDef: ComponentDef<Opacity> = {
  name: 'opacity',
  deserialize: validate,
  serialize(v: Opacity): unknown { return { value: v.value }; },
};
