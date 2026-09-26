import type { SymbolKind } from './engine-surface';

/**
 * Enumerates public exports that carry no JSDoc summary, powering the coverage
 * ratchet (`jsdoc-coverage.test.ts`). An undocumented export still renders on
 * the `/api/` site (TypeDoc does not `excludeNotDocumented`) and gives no IDE
 * hover text, so this is the same "missing summary" the API catalog marks with
 * `— —` in `docs/agent/engine-api.md` — the human-readable backlog.
 *
 * Pure: builds the program and reads doc comments; writes nothing.
 */
import { join } from 'node:path';

import ts from 'typescript';

import { publicSymbolsOf, readEntries, ROOT } from './engine-surface';

/** A public export with an empty JSDoc summary. */
export interface UndocumentedExport {
  name: string;
  importPath: string;
  kind: SymbolKind;
}

/**
 * Every public export (per `exports` subpath, matching the API catalog) whose
 * resolved declaration has no JSDoc documentation comment.
 */
export function undocumentedExports(): UndocumentedExport[] {
  const configFile = ts.readConfigFile(join(ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);
  const program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
  const checker = program.getTypeChecker();

  const out: UndocumentedExport[] = [];
  for (const entry of readEntries()) {
    for (const symbol of publicSymbolsOf(program, checker, entry)) {
      const doc = ts.displayPartsToString(symbol.symbol.getDocumentationComment(checker)).trim();
      if (!doc)
        out.push({ name: symbol.name, importPath: entry.importPath, kind: symbol.kind });
    }
  }
  return out;
}
