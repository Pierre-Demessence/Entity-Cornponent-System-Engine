/**
 * Fails `npm test`, naming the README and line, when a module README's
 * signature-listing block documents a `function`/`class`/`interface`/`type`
 * whose name is not a public engine export — the stale-doc case a renamed or
 * removed export leaves behind. Existence only; signature-shape matching is a
 * possible future extension.
 */
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { readEntries } from './engine-surface';
import { declaredSymbols, SYMBOL_ALLOWLIST } from './readme-symbols';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');

/** The names of every public export across the whole `exports` surface. */
function engineExportNames(): Set<string> {
  const config = ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  const program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
  const checker = program.getTypeChecker();
  const names = new Set<string>();
  for (const entry of readEntries()) {
    const sourceFile = program.getSourceFile(entry.file);
    const moduleSymbol = sourceFile ? checker.getSymbolAtLocation(sourceFile) : undefined;
    if (!moduleSymbol)
      continue;
    for (const exp of checker.getExportsOfModule(moduleSymbol))
      names.add(exp.getName());
  }
  return names;
}

const exportNames = engineExportNames();
const allowed = new Set(SYMBOL_ALLOWLIST.map(a => a.name));
const symbols = declaredSymbols().filter(s => !allowed.has(s.name));

describe('module README signature listings name real exports', () => {
  it.each(symbols.map(s => ({ key: `${s.readmeRel}:${s.line}`, symbol: s })))(
    '$key documents a real export',
    ({ symbol }) => {
      const message = `${symbol.readmeRel}:${symbol.line} — documents `
        + `${symbol.kind} \`${symbol.name}\`, which is not a public @pierre/ecs export`;
      expect(exportNames.has(symbol.name) ? null : message).toBeNull();
    },
  );

  it('checks a meaningful number of documented symbols', () => {
    expect(symbols.length).toBeGreaterThan(50);
  });

  it('allowlists only names with a stated reason', () => {
    for (const allowance of SYMBOL_ALLOWLIST)
      expect(allowance.reason.trim().length).toBeGreaterThan(0);
  });
});
