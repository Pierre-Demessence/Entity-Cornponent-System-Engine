import type { ComponentDef } from '#index';

import { asNumber, asObject, asString } from '#validation';

/**
 * Discriminated union of drawable shapes the default Canvas2D renderer
 * understands. Kept minimal in v1 — rect + circle cover everything the
 * three prototypes draw declaratively. Rotation, scale, opacity, and
 * sprites are deferred until a consumer needs them (Path-A rule of
 * three).
 *
 * Anchor convention:
 * - `rect`: position is the top-left corner of the rectangle.
 * - `circle`: position is the centre of the circle.
 *
 * Both fill and stroke are optional; supplying neither draws nothing
 * (the renderer skips the entity). Supplying both draws fill first,
 * then stroke on top.
 */
export type Renderable
  = | {
    kind: 'rect';
    w: number;
    h: number;
    fill?: string;
    stroke?: string;
    lineWidth?: number;
  }
  | {
    kind: 'circle';
    radius: number;
    fill?: string;
    stroke?: string;
    lineWidth?: number;
  };

function assertNonNegative(value: number, label: string): number {
  if (value < 0)
    throw new Error(`${label}: expected a non-negative number, got ${value}`);
  return value;
}

function validate(raw: unknown, label: string): Renderable {
  const obj = asObject(raw, label);
  const kind = asString(obj.kind, `${label}.kind`);
  const fill = obj.fill === undefined ? undefined : asString(obj.fill, `${label}.fill`);
  const stroke = obj.stroke === undefined ? undefined : asString(obj.stroke, `${label}.stroke`);
  const lineWidth = obj.lineWidth === undefined
    ? undefined
    : assertNonNegative(asNumber(obj.lineWidth, `${label}.lineWidth`), `${label}.lineWidth`);
  if (kind === 'rect') {
    return {
      fill,
      h: assertNonNegative(asNumber(obj.h, `${label}.h`), `${label}.h`),
      kind: 'rect',
      lineWidth,
      stroke,
      w: assertNonNegative(asNumber(obj.w, `${label}.w`), `${label}.w`),
    };
  }
  if (kind === 'circle') {
    return {
      fill,
      kind: 'circle',
      lineWidth,
      radius: assertNonNegative(asNumber(obj.radius, `${label}.radius`), `${label}.radius`),
      stroke,
    };
  }
  throw new Error(`${label}.kind: expected 'rect' or 'circle', got '${kind}'`);
}

/**
 * Component def for `Renderable`. Entities carrying this component plus
 * a `PositionDef` will be drawn automatically by `Canvas2DRenderer`.
 */
export const RenderableDef: ComponentDef<Renderable> = {
  name: 'renderable',
  deserialize: validate,
  requires: ['position'],
  serialize(value: Renderable): unknown {
    if (value.kind === 'rect') {
      return {
        fill: value.fill,
        h: value.h,
        kind: 'rect',
        lineWidth: value.lineWidth,
        stroke: value.stroke,
        w: value.w,
      };
    }
    return {
      fill: value.fill,
      kind: 'circle',
      lineWidth: value.lineWidth,
      radius: value.radius,
      stroke: value.stroke,
    };
  },
};
