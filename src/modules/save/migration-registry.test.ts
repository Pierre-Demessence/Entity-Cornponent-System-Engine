import { describe, expect, it } from 'vitest';

import { MigrationRegistry } from './migration-registry';

function makeBlob(version: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { version, ...extra };
}

describe('migrationRegistry', () => {
  describe('register', () => {
    it('rejects backward migrations', () => {
      const reg = new MigrationRegistry();
      expect(() => reg.register(2, 1, b => b)).toThrow('must go forward');
    });

    it('rejects same-version migrations', () => {
      const reg = new MigrationRegistry();
      expect(() => reg.register(1, 1, b => b)).toThrow('must go forward');
    });

    it('rejects non-integer versions', () => {
      const reg = new MigrationRegistry();
      expect(() => reg.register(1.5, 2, b => b)).toThrow('must be integers');
      expect(() => reg.register(1, 2.5, b => b)).toThrow('must be integers');
    });

    it('rejects ambiguous chains from the same version', () => {
      const reg = new MigrationRegistry();
      reg.register(1, 2, b => b);
      expect(() => reg.register(1, 3, b => b)).toThrow('already registered');
    });
  });

  describe('run', () => {
    it('returns blob unchanged when versions match', () => {
      const reg = new MigrationRegistry();
      const blob = makeBlob(3);
      expect(reg.run(blob, 3, 3)).toBe(blob);
    });

    it('throws when saved version is newer than target', () => {
      const reg = new MigrationRegistry();
      expect(() => reg.run(makeBlob(5), 5, 3)).toThrow('Downgrading is not supported');
    });

    it('throws when no migration path exists', () => {
      const reg = new MigrationRegistry();
      expect(() => reg.run(makeBlob(1), 1, 2)).toThrow('No migration path');
    });

    it('runs a single-step migration', () => {
      const reg = new MigrationRegistry();
      reg.register(1, 2, blob => ({ ...blob, upgraded: true }));

      const result = reg.run(makeBlob(1), 1, 2);

      expect(result.version).toBe(2);
      expect(result.upgraded).toBe(true);
    });

    it('chains multiple migrations in order', () => {
      const reg = new MigrationRegistry();
      reg.register(1, 2, blob => ({ ...blob, step1: true }));
      reg.register(2, 3, blob => ({ ...blob, step2: true }));
      reg.register(3, 4, blob => ({ ...blob, step3: true }));

      const result = reg.run(makeBlob(1), 1, 4);

      expect(result.version).toBe(4);
      expect(result.step1).toBe(true);
      expect(result.step2).toBe(true);
      expect(result.step3).toBe(true);
    });

    it('throws when chain is broken mid-way', () => {
      const reg = new MigrationRegistry();
      reg.register(1, 2, b => b);

      expect(() => reg.run(makeBlob(1), 1, 3)).toThrow('Chain broke at version 2');
    });
  });
});
