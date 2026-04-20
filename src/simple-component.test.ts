import { simpleComponent } from '#component-store';
import { describe, expect, it } from 'vitest';

describe('simpleComponent', () => {
  interface Pos { x: number; y: number }

  it('round-trips a numeric schema', () => {
    const def = simpleComponent<Pos>('position', { x: 'number', y: 'number' });
    const serialized = def.serialize({ x: 1, y: 2 });
    expect(serialized).toEqual({ x: 1, y: 2 });
    expect(def.deserialize(serialized, 'pos')).toEqual({ x: 1, y: 2 });
  });

  it('supports boolean and string fields', () => {
    interface Flag { name: string; level: number; on: boolean }
    const def = simpleComponent<Flag>('flag', {
      name: 'string',
      level: 'number',
      on: 'boolean',
    });
    const v: Flag = { name: 'x', level: 5, on: true };
    expect(def.deserialize(def.serialize(v), 'f')).toEqual(v);
  });

  it('rejects wrong field types with a labeled error', () => {
    const def = simpleComponent<Pos>('position', { x: 'number', y: 'number' });
    expect(() => def.deserialize({ x: '1', y: 2 }, 'pos'))
      .toThrow(/pos\.x must be a finite number/);
    expect(() => def.deserialize({ x: 1, y: true }, 'pos'))
      .toThrow(/pos\.y must be a finite number/);
  });

  it('rejects non-object input', () => {
    const def = simpleComponent<Pos>('position', { x: 'number', y: 'number' });
    expect(() => def.deserialize(null, 'pos')).toThrow();
    expect(() => def.deserialize(42, 'pos')).toThrow();
  });

  it('ignores extra fields on serialize (strict to schema)', () => {
    const def = simpleComponent<Pos>('position', { x: 'number', y: 'number' });
    const extra = { x: 1, y: 2, z: 99 } as unknown as Pos;
    expect(def.serialize(extra)).toEqual({ x: 1, y: 2 });
  });

  it('ignores extra fields on deserialize (strict to schema)', () => {
    const def = simpleComponent<Pos>('position', { x: 'number', y: 'number' });
    expect(def.deserialize({ x: 1, y: 2, z: 99 }, 'pos')).toEqual({ x: 1, y: 2 });
  });

  it('carries requires/version/migrations onto the generated def', () => {
    const def = simpleComponent<Pos>('position', { x: 'number', y: 'number' }, {
      migrations: { 0: raw => raw, 1: raw => raw },
      requires: ['velocity'],
      version: 2,
    });
    expect(def.requires).toEqual(['velocity']);
    expect(def.version).toBe(2);
    expect(def.migrations).toBeDefined();
    expect(def.name).toBe('position');
  });

  it('rejects missing fields', () => {
    const def = simpleComponent<Pos>('position', { x: 'number', y: 'number' });
    expect(() => def.deserialize({ x: 1 }, 'pos')).toThrow(/pos\.y/);
  });
});
