import { describe, expect, it } from 'vitest';

import { DomRenderableDef } from './dom-renderable';

function parse(raw: unknown) {
  return DomRenderableDef.deserialize(raw, 'renderable');
}

describe('domRenderableDef', () => {
  it('accepts a safe renderable shape', () => {
    const value = parse({
      attributes: { role: 'button', title: 'Card' },
      className: 'card',
      dataset: { zone: 'hand' },
      style: { 'z-index': '2' },
      tag: 'section',
      text: 'Strike',
    });

    expect(value.tag).toBe('section');
    expect(value.attributes).toEqual({ role: 'button', title: 'Card' });
    expect(value.dataset).toEqual({ zone: 'hand' });
  });

  it('rejects uppercase tag names', () => {
    expect(() => parse({ tag: 'DIV' })).toThrow('expected a lowercase tag name');
  });

  it('rejects reserved engine-owned identifiers', () => {
    expect(() => parse({ attributes: { 'data-entity-id': '42' } })).toThrow('reserved for engine ownership');
    expect(() => parse({ dataset: { 'entity-id': '42' } })).toThrow('reserved for engine ownership');
  });

  it('rejects unsafe attribute keys', () => {
    expect(() => parse({ attributes: { onclick: 'alert(1)' } })).toThrow('event handler attributes are not allowed');
    expect(() => parse({ attributes: { class: 'x' } })).toThrow('use dedicated renderable fields instead');
    expect(() => parse({ attributes: { style: 'color:red' } })).toThrow('use dedicated renderable fields instead');
    expect(() => parse({ attributes: { srcdoc: '<script>evil()</script>' } })).toThrow('srcdoc is not allowed');
  });

  it('rejects engine-owned style keys', () => {
    expect(() => parse({ style: { left: '10px' } })).toThrow('engine-owned');
    expect(() => parse({ style: { position: 'relative' } })).toThrow('engine-owned');
    expect(() => parse({ style: { top: '5px' } })).toThrow('engine-owned');
  });
});
