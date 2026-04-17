import type { EntityTemplate } from './template';

import { describe, expect, it } from 'vitest';

import { composeTemplates } from './template';

describe('composeTemplates', () => {
  it('throws on zero templates', () => {
    expect(() => composeTemplates()).toThrow(/at least one/);
  });

  it('returns an equivalent template for a single input', () => {
    const t: EntityTemplate = {
      name: 'goblin',
      components: { fighter: { hp: 5 } },
      tags: ['enemy'],
    };
    const result = composeTemplates(t);
    expect(result.name).toBe('goblin');
    expect(result.components).toEqual({ fighter: { hp: 5 } });
    expect(result.tags).toEqual(['enemy']);
    // Does not mutate input references — result is a fresh object.
    expect(result).not.toBe(t);
  });

  it('takes the name from the last template', () => {
    const base: EntityTemplate = { name: 'base' };
    const middle: EntityTemplate = { name: 'middle' };
    const last: EntityTemplate = { name: 'last' };
    expect(composeTemplates(base, middle, last).name).toBe('last');
  });

  it('shallow-merges components with later winning', () => {
    const base: EntityTemplate = {
      name: 'base',
      components: { fighter: { attack: 1, hp: 5 }, position: { x: 0, y: 0 } },
    };
    const override: EntityTemplate = {
      name: 'boss',
      components: { fighter: { hp: 50 } },
    };
    const result = composeTemplates(base, override);
    // fighter is replaced wholesale (no deep merge).
    expect(result.components).toEqual({
      fighter: { hp: 50 },
      position: { x: 0, y: 0 },
    });
  });

  it('unions tags across all inputs, de-duplicated', () => {
    const a: EntityTemplate = { name: 'a', tags: ['enemy', 'alive'] };
    const b: EntityTemplate = { name: 'b', tags: ['alive', 'boss'] };
    const result = composeTemplates(a, b);
    expect(result.tags).toEqual(['enemy', 'alive', 'boss']);
  });

  it('omits empty components/tags from the result', () => {
    const result = composeTemplates({ name: 'bare' });
    expect(result).toEqual({ name: 'bare' });
    expect('components' in result).toBe(false);
    expect('tags' in result).toBe(false);
  });

  it('does not mutate its inputs', () => {
    const base: EntityTemplate = {
      name: 'base',
      components: { fighter: { hp: 5 } },
      tags: ['enemy'],
    };
    const override: EntityTemplate = {
      name: 'elite',
      components: { fighter: { hp: 20 } },
      tags: ['boss'],
    };
    composeTemplates(base, override);
    expect(base.components).toEqual({ fighter: { hp: 5 } });
    expect(base.tags).toEqual(['enemy']);
    expect(override.components).toEqual({ fighter: { hp: 20 } });
    expect(override.tags).toEqual(['boss']);
  });
});
