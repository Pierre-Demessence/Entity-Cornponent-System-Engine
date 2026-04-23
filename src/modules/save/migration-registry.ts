type RawBlob = Record<string, unknown>;
export type MigrateFn = (blob: RawBlob) => RawBlob;

interface MigrationStep {
  from: number;
  migrate: MigrateFn;
  to: number;
}

/**
 * Version-to-version migration chain for versioned save payloads.
 *
 * - Exactly one outgoing migration is allowed per version to keep paths
 *   deterministic.
 * - Downgrades are intentionally unsupported.
 */
export class MigrationRegistry {
  private readonly steps: MigrationStep[] = [];

  private buildChain(from: number, to: number): MigrationStep[] {
    const chain: MigrationStep[] = [];
    let current = from;

    while (current < to) {
      const next = this.steps.find(s => s.from === current);
      if (!next) {
        throw new Error(
          `No migration path from version ${current} to ${to}. `
          + `Chain broke at version ${current}.`,
        );
      }
      chain.push(next);
      current = next.to;
    }

    return chain;
  }

  register(from: number, to: number, migrate: MigrateFn): this {
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      throw new TypeError(`Migration versions must be integers: ${from} -> ${to}.`);
    }

    if (from >= to) {
      throw new Error(`Migration must go forward: ${from} -> ${to}.`);
    }

    const conflict = this.steps.find(s => s.from === from);
    if (conflict) {
      throw new Error(
        `A migration from version ${from} is already registered (${from} -> ${conflict.to}). `
        + 'Each version may only have one outgoing migration to keep the chain unambiguous.',
      );
    }

    this.steps.push({ from, migrate, to });
    return this;
  }

  run(blob: RawBlob, savedVersion: number, targetVersion: number): RawBlob {
    if (savedVersion === targetVersion) {
      return blob;
    }

    if (savedVersion > targetVersion) {
      throw new Error(
        `Save version ${savedVersion} is newer than the current version ${targetVersion}. `
        + 'Downgrading is not supported.',
      );
    }

    const chain = this.buildChain(savedVersion, targetVersion);
    let current = blob;
    for (const step of chain) {
      current = step.migrate(current);
      current.version = step.to;
    }

    return current;
  }
}
