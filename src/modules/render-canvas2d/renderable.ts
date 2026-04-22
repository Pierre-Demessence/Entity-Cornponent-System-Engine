import type { ComponentDef } from '#index';

import { asArray, asNumber, asObject, asString } from '#validation';

/**
 * Discriminated union of drawable shapes the default Canvas2D renderer
 * understands.
 *
 * Anchor convention:
 * - `rect`: `anchor` chooses `'top-left'` (default — V1) or `'center'`.
 * - `circle`: `anchor` chooses `'center'` (default — V1) or `'top-left'`
 *   (top-left of the circle's bounding box, useful when a circle is
 *   co-located with a top-left-anchored AABB).
 * - `polygon`: position is the polygon origin; points are in local
 *   space and rotate/scale around position.
 * - `text`: position is the text draw origin; use `align`/`baseline`
 *   to control Canvas2D's text anchoring.
 *
 * Both fill and stroke are optional; supplying neither draws nothing.
 * Supplying both draws fill first, then stroke on top.
 */
export type RectAnchor = 'center' | 'top-left';
export type CircleAnchor = 'center' | 'top-left';

export interface PolygonPoint { x: number; y: number }

export type Renderable
  = | {
    kind: 'rect';
    w: number;
    h: number;
    anchor?: RectAnchor;
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    blendMode?: GlobalCompositeOperation;
  }
  | {
    kind: 'circle';
    radius: number;
    anchor?: CircleAnchor;
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    blendMode?: GlobalCompositeOperation;
  }
  | {
    kind: 'polygon';
    points: readonly PolygonPoint[];
    closed: boolean;
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    blendMode?: GlobalCompositeOperation;
  }
  | {
    kind: 'text';
    text: string;
    font: string;
    align?: CanvasTextAlign;
    baseline?: CanvasTextBaseline;
    fill?: string;
    stroke?: string;
    lineWidth?: number;
    blendMode?: GlobalCompositeOperation;
  };

function assertNonNegative(value: number, label: string): number {
  if (value < 0)
    throw new Error(`${label}: expected a non-negative number, got ${value}`);
  return value;
}

function optString(raw: unknown, label: string): string | undefined {
  return raw === undefined ? undefined : asString(raw, label);
}

function optNonNegNumber(raw: unknown, label: string): number | undefined {
  return raw === undefined
    ? undefined
    : assertNonNegative(asNumber(raw, label), label);
}

function parseAnchor(raw: unknown, label: string): 'center' | 'top-left' | undefined {
  if (raw === undefined)
    return undefined;
  const s = asString(raw, label);
  if (s !== 'top-left' && s !== 'center')
    throw new Error(`${label}: expected 'top-left' or 'center', got '${s}'`);
  return s;
}

function parseBlendMode(raw: unknown, label: string): GlobalCompositeOperation | undefined {
  if (raw === undefined)
    return undefined;
  return asString(raw, label) as GlobalCompositeOperation;
}

function parsePoints(raw: unknown, label: string): PolygonPoint[] {
  const arr = asArray(raw, label);
  if (arr.length < 2)
    throw new Error(`${label}: polygon requires at least 2 points, got ${arr.length}`);
  return arr.map((p, i) => {
    const o = asObject(p, `${label}[${i}]`);
    return {
      x: asNumber(o.x, `${label}[${i}].x`),
      y: asNumber(o.y, `${label}[${i}].y`),
    };
  });
}

function validate(raw: unknown, label: string): Renderable {
  const obj = asObject(raw, label);
  const kind = asString(obj.kind, `${label}.kind`);
  const fill = optString(obj.fill, `${label}.fill`);
  const stroke = optString(obj.stroke, `${label}.stroke`);
  const lineWidth = optNonNegNumber(obj.lineWidth, `${label}.lineWidth`);
  const blendMode = parseBlendMode(obj.blendMode, `${label}.blendMode`);
  if (kind === 'rect') {
    return {
      anchor: parseAnchor(obj.anchor, `${label}.anchor`),
      blendMode,
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
      anchor: parseAnchor(obj.anchor, `${label}.anchor`),
      blendMode,
      fill,
      kind: 'circle',
      lineWidth,
      radius: assertNonNegative(asNumber(obj.radius, `${label}.radius`), `${label}.radius`),
      stroke,
    };
  }
  if (kind === 'polygon') {
    const points = parsePoints(obj.points, `${label}.points`);
    const closedRaw = obj.closed;
    if (typeof closedRaw !== 'boolean')
      throw new Error(`${label}.closed: expected boolean, got ${typeof closedRaw}`);
    if (!closedRaw && fill !== undefined) {
      throw new Error(
        `${label}: cannot apply \`fill\` to an open polygon; `
        + `Canvas2D auto-closes for fill. Use \`closed: true\` or remove \`fill\`.`,
      );
    }
    return {
      blendMode,
      closed: closedRaw,
      fill,
      kind: 'polygon',
      lineWidth,
      points,
      stroke,
    };
  }
  if (kind === 'text') {
    const align = obj.align === undefined
      ? undefined
      : (asString(obj.align, `${label}.align`) as CanvasTextAlign);
    const baseline = obj.baseline === undefined
      ? undefined
      : (asString(obj.baseline, `${label}.baseline`) as CanvasTextBaseline);
    return {
      align,
      baseline,
      blendMode,
      fill,
      font: asString(obj.font, `${label}.font`),
      kind: 'text',
      lineWidth,
      stroke,
      text: asString(obj.text, `${label}.text`),
    };
  }
  throw new Error(
    `${label}.kind: expected 'rect', 'circle', 'polygon', or 'text', got '${kind}'`,
  );
}

function serialize(value: Renderable): unknown {
  switch (value.kind) {
    case 'rect':
      return {
        anchor: value.anchor,
        blendMode: value.blendMode,
        fill: value.fill,
        h: value.h,
        kind: 'rect',
        lineWidth: value.lineWidth,
        stroke: value.stroke,
        w: value.w,
      };
    case 'circle':
      return {
        anchor: value.anchor,
        blendMode: value.blendMode,
        fill: value.fill,
        kind: 'circle',
        lineWidth: value.lineWidth,
        radius: value.radius,
        stroke: value.stroke,
      };
    case 'polygon':
      return {
        blendMode: value.blendMode,
        closed: value.closed,
        fill: value.fill,
        kind: 'polygon',
        lineWidth: value.lineWidth,
        points: value.points.map(p => ({ x: p.x, y: p.y })),
        stroke: value.stroke,
      };
    case 'text':
      return {
        align: value.align,
        baseline: value.baseline,
        blendMode: value.blendMode,
        fill: value.fill,
        font: value.font,
        kind: 'text',
        lineWidth: value.lineWidth,
        stroke: value.stroke,
        text: value.text,
      };
  }
}

/**
 * Component def for `Renderable`. Entities carrying this component plus
 * a `PositionDef` will be drawn automatically by `Canvas2DRenderer`.
 */
export const RenderableDef: ComponentDef<Renderable> = {
  name: 'renderable',
  deserialize: validate,
  requires: ['position'],
  serialize,
};
