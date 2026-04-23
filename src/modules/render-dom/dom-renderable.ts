import type { ComponentDef } from '#component-store';

import { asBoolean, asObject, asString } from '#validation';

const ENTITY_ID_ATTR = 'data-entity-id';
const TAG_NAME_RE = /^[a-z][a-z0-9-]*$/;

export interface DomRenderable {
  attributes?: Record<string, string>;
  className?: string;
  dataset?: Record<string, string>;
  hidden?: boolean;
  style?: Record<string, string>;
  tag?: string;
  text?: string;
}

function assertTagName(raw: unknown, label: string): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const tag = asString(raw, label);
  if (!TAG_NAME_RE.test(tag)) {
    throw new Error(`${label}: expected a lowercase tag name, got '${tag}'`);
  }
  return tag;
}

function parseStringMap(
  raw: unknown,
  label: string,
  options?: {
    disallowClassAndStyleAttrs?: boolean;
    disallowEntityIdAttr?: boolean;
    disallowEntityIdDataset?: boolean;
    disallowEventHandlerAttrs?: boolean;
    disallowPositionStyleKeys?: boolean;
    disallowSrcDocAttr?: boolean;
  },
): Record<string, string> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const input = asObject(raw, label);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (options?.disallowEntityIdAttr && lower === ENTITY_ID_ATTR) {
      throw new Error(`${label}.${key}: reserved for engine ownership`);
    }
    if (options?.disallowEntityIdDataset && lower === 'entity-id') {
      throw new Error(`${label}.${key}: reserved for engine ownership`);
    }
    if (options?.disallowEventHandlerAttrs && lower.startsWith('on')) {
      throw new Error(`${label}.${key}: event handler attributes are not allowed`);
    }
    if (options?.disallowClassAndStyleAttrs && (lower === 'class' || lower === 'classname' || lower === 'style')) {
      throw new Error(`${label}.${key}: use dedicated renderable fields instead`);
    }
    if (options?.disallowSrcDocAttr && lower === 'srcdoc') {
      throw new Error(`${label}.${key}: srcdoc is not allowed`);
    }
    if (options?.disallowPositionStyleKeys && (lower === 'left' || lower === 'position' || lower === 'top')) {
      throw new Error(`${label}.${key}: this style key is engine-owned`);
    }
    out[key] = asString(value, `${label}.${key}`);
  }
  return out;
}

function validate(raw: unknown, label: string): DomRenderable {
  const obj = asObject(raw, label);
  return {
    className: obj.className === undefined ? undefined : asString(obj.className, `${label}.className`),
    hidden: obj.hidden === undefined ? undefined : asBoolean(obj.hidden, `${label}.hidden`),
    tag: assertTagName(obj.tag, `${label}.tag`),
    text: obj.text === undefined ? undefined : asString(obj.text, `${label}.text`),
    attributes: parseStringMap(obj.attributes, `${label}.attributes`, {
      disallowClassAndStyleAttrs: true,
      disallowEntityIdAttr: true,
      disallowEventHandlerAttrs: true,
      disallowSrcDocAttr: true,
    }),
    dataset: parseStringMap(obj.dataset, `${label}.dataset`, {
      disallowEntityIdDataset: true,
    }),
    style: parseStringMap(obj.style, `${label}.style`, {
      disallowPositionStyleKeys: true,
    }),
  };
}

export const DomRenderableDef: ComponentDef<DomRenderable> = {
  name: 'domRenderable',
  deserialize: validate,
  serialize(value: DomRenderable): unknown {
    return {
      attributes: value.attributes ? { ...value.attributes } : undefined,
      className: value.className,
      dataset: value.dataset ? { ...value.dataset } : undefined,
      hidden: value.hidden,
      style: value.style ? { ...value.style } : undefined,
      tag: value.tag,
      text: value.text,
    };
  },
};
