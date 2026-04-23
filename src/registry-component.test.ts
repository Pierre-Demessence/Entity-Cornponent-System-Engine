import { registryComponent } from '#component-store';
import { describe, expect, it } from 'vitest';

describe('registryComponent', () => {
  interface CardDef {
    id: string;
    label: string;
  }

  const cards: Record<string, CardDef> = {
    defend: { id: 'defend', label: 'Defend' },
    strike: { id: 'strike', label: 'Strike' },
  };

  it('round-trips default def and id shape', () => {
    const def = registryComponent<CardDef, string>('card', {
      lookup: id => cards[id],
      selectId: card => card.id,
    });

    const value = { def: cards.strike };
    const serialized = def.serialize(value);

    expect(serialized).toEqual({ id: 'strike' });
    expect(def.deserialize(serialized, 'card')).toEqual(value);
  });

  it('throws when id is missing from the registry', () => {
    const def = registryComponent<CardDef, string>('card', {
      lookup: id => cards[id],
      selectId: card => card.id,
    });

    expect(() => def.deserialize({ id: 'unknown' }, 'card'))
      .toThrow(/card\.id 'unknown'/);
  });

  it('supports number ids and custom field names', () => {
    interface EnemyDef {
      name: string;
      key: number;
    }
    const enemies: Record<number, EnemyDef> = {
      1: { name: 'Rat', key: 1 },
      2: { name: 'Wolf', key: 2 },
    };

    const def = registryComponent<EnemyDef, number, 'archetype'>('enemy', {
      idKey: 'defId',
      idKind: 'number',
      valueKey: 'archetype',
      lookup: id => enemies[id],
      selectId: enemy => enemy.key,
    });

    const value = { archetype: enemies[2] };
    const serialized = def.serialize(value);

    expect(serialized).toEqual({ defId: 2 });
    expect(def.deserialize(serialized, 'enemy')).toEqual(value);
  });

  it('carries requires, version, and migrations onto the generated def', () => {
    const def = registryComponent<CardDef, string>('card', {
      migrations: { 0: raw => raw, 1: raw => raw },
      requires: ['owner'],
      version: 2,
      lookup: id => cards[id],
      selectId: card => card.id,
    });

    expect(def.requires).toEqual(['owner']);
    expect(def.version).toBe(2);
    expect(def.migrations).toBeDefined();
    expect(def.name).toBe('card');
  });

  it('validates id primitive kind using idKind', () => {
    const def = registryComponent<CardDef, number>('card', {
      idKind: 'number',
      lookup: () => undefined,
      selectId: () => 1,
    });

    expect(() => def.deserialize({ id: '1' }, 'card'))
      .toThrow(/card\.id must be a finite number/);
  });
});
