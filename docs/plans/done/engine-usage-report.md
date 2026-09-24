# Plan: engine usage report (symbol references across examples)

## Problem

`examples/` is the engine's proof surface: each prototype is the evidence that a
primitive's shape survives a real game. Nothing reports *what those examples
actually use*, so coverage is guessed from memory. Three failure modes follow:

- A module with zero consumers is invisible. A rough import scan (today) finds
  **9 of 44 modules with no example consumer**: `grid-based`, `noise`,
  `pathfinding`, `save`, `scene-transition`, `stats`, `timer`, `turn-based`,
  `tween`.
- Module-level counts overstate coverage. `steering` is imported by 4 examples,
  yet no example references `evade` or `pursue`.
- "0 examples" is not "unproven". `timer` has no example consumer but is
  imported by `cooldown`, `lifetime`, `particles`, and `tween`.

`docs/agent/engine-api.md` answers "what exists". Nothing answers "what is used".
This report is the inverse view of that catalog.

## Decision (with user)

Generate a committed, drift-guarded **usage report** from the TypeScript compiler:
for every public symbol, the set of files that reference it, bucketed by consumer
kind. Rejected alternatives:

- **Import-specifier text scan.** Accurate at module level only; breaks on
  multi-line imports, `as` aliases, `import * as ns` + `ns.foo()`, and example
  barrels such as `asteroids/src/components/index.ts`.
- **Runtime coverage** (V8 precise coverage or an Istanbul probe + a headless
  Playwright run per example). Measures *exercised* code, which needs a headless
  harness and simulated input per game — recorded as a non-goal, revivable later
  for a few flagship examples.

Agreed with the user:

- Exclude `dist/`, `node_modules/`, and `examples/hub` — hub imports every other
  example, so it would smear coverage across all modules.
- Ignore consumers outside this repo (sibling repos such as `Roguelike/`).
- Report references, not runtime exercise; the artifact must say so.
- Module→module and test references are their own buckets, not "unused".

## Design

### 1. Share the surface enumerator

`scripts/engine-api.ts` already knows the public surface: it reads
`package.json` `exports`, resolves re-export aliases, and classifies kinds.
Extract the shared, pure parts into `scripts/engine-surface.ts`:

- `readEntries()` and the `Entry` type
- `compareNames()` — the existing ICU-independent comparator
- `kindOf()`
- `publicSymbolsOf(program, checker, entry)` →
  `{ name, kind, symbol, declarationFile }`

`engine-api.ts` imports them. Its generated output must stay **byte-identical**,
which the existing drift test proves.

### 2. Collect references

One `ts.createProgram` over the root `tsconfig.json` file list **plus** every
`examples/*/src/**/*.ts` except hub. The root options suit both trees
(`moduleResolution: bundler`, `allowImportingTsExtensions`, DOM libs), and
`@pierre/ecs` resolves into `src/` through the workspace `file:` link —
`preserveSymlinks` is off, so an example's import and the engine declaration
unify into a single symbol. **No diagnostics gate:** unresolved third-party
imports (`three`, used by 4 examples) must not fail generation.

Per public symbol: prefilter candidate files by literal name occurrence, then
confirm each hit with `checker.getSymbolAtLocation` + alias resolution, keeping
only hits whose canonical symbol identity matches.

**Excluded references:**

- the symbol's own declaration site;
- anything inside an `ExportDeclaration` (`export { X } from …`) — re-export
  plumbing, present only in barrels;
- anything inside an `ImportDeclaration` in an entry-barrel file (`src/index.ts`
  or any file listed by `readEntries()`), since such an import exists only to be
  re-exported;
- for a module symbol, anything inside its own module directory
  (`src/modules/<m>/**`) — a module consuming its own helper proves nothing
  about that module's surface — **except its own `*.test.ts`**, which stays in
  the `test` bucket (it is that module's primary evidence). Core symbols
  exclude their own declaration file instead.

An import specifier in a consuming file is itself a reference — it is how the
detector sees the symbol at all; the third rule excludes it only inside entry
barrels, where the import exists solely to be re-exported. Everything else
counts, which keeps real internal use (`src/scheduler.ts` importing `World`)
while dropping barrels and self-consumption.

**Mode** per reference: `value` (call, argument, member base, initializer,
returned expression) or `type` (type annotation, type argument, heritage clause,
`import type` clause). A value symbol referenced only in type position
(`typeof vec3Add`) does not count as behaviourally used.

### 3. Buckets

| bucket | source path | meaning |
|---|---|---|
| `example` | `examples/<name>/src/**` | a prototype proves it |
| `test` | `src/**/*.test.ts` | unit-tested only |
| `src-other` | other `src/**` | other modules / core internals use it |
| `never` | — | nothing in this repo references it |

Symbols split by kind into **value** (`fn`, `class`, `const`, `enum`) and
**type** (`type`, `interface`). "A module of 20 functions where 4 examples all
call the same one" is only visible in the value column.

### 4. Output — `docs/agent/engine-usage.md` (generated, committed)

Deterministic order, existing comparator. Sections:

1. **Headline** — module/symbol counts, modules with ≥1 example, modules with
   none, value symbols referenced by no example. States the
   referenced-not-exercised caveat.
2. **Modules** — one row each:
   `module | value syms used/total | type syms used/total | examples | tests | src-other | never referenced`,
   where `examples` is the distinct `examples/*` list and `never referenced`
   lists symbol names (capping rule below).
3. **Entries with no example reference** — core primitives included, not only
   modules; the `timer` case is annotated, so "no example" is not read as
   "unproven".
4. **Next-example candidates** — modules ranked by unreferenced value symbols;
   the input for choosing the next game in `docs/twenty-games-challenge.md`.
5. **Coverage by example** — example → modules touched + value symbols
   referenced, so an under-exercising example is visible too.

Row shape, using counts verified by hand-scan today:

```
| `steering` | 9/11 | … | boids, critters, stealth-guard, woodcutter | yes | — | `evade`, `pursue` |
| `timer`    | 0/12 | … | —                                         | yes | cooldown, lifetime, particles, tween | … |
```

Ordering is part of the contract, so the drift test stays byte-stable across
machines: modules by `compareNames` on import path, symbols within a row by
name, and every example / bucket list by name. The `never referenced` column
lists at most 8 names then `+N more`; the full per-symbol list lives in an
appendix section. A symbol with no reference outside its own source is marked
`no external consumer` (never "unused" — see the header caveat).

### 5. Files

- `scripts/engine-usage.ts` — pure `generateEngineUsageMarkdown()`
- `scripts/engine-usage.gen.ts` — CLI writer
- `scripts/engine-usage.test.ts` — drift guard (`regen == committed`) with an
  explicit `30_000` ms timeout, since this program is larger than the API
  catalog's (vitest's 5 s default is not a budget we can rely on), plus
  unit tests for the exclusion rules and the value/type classifier (parsed from
  source strings via `ts.createSourceFile`, no program needed)
- `docs/agent/engine-usage.md` — generated output
- `package.json` — `"docs:usage": "jiti scripts/engine-usage.gen.ts"`

Keep the added test time modest (target < ~10 s). If the program build outgrows
the drift-test timeout, use `ts.createIncrementalProgram` with a build-info file
rather than dropping the guard.

### 6. Self-checks (fail loud, not silent)

Coverage tooling degrades silently when resolution breaks. Two assertions:

1. Every `readEntries()` entry must appear in the program — `engine-api.ts`
   already throws on a missing entry file; keep that behavior shared.
2. Any `examples/*/src` file whose parsed `ImportDeclaration`s name a
   `@pierre/ecs` specifier must yield at least one resolved engine symbol, else
   throw naming the file. Detection goes through the program's AST, not a text
   grep, so a comment can never satisfy it. This catches a new example without
   `npm install`, which would otherwise be reported as using nothing.

## Non-goals

- Runtime "exercised" coverage.
- Non-exported internals — the public export list is the proof surface.
- Line/branch percentages, thresholds, or CI gating. This is a discovery report;
  it never fails a build for low coverage.
- Consumer statistics outside this repo.

## Checklist

- [x] `scripts/engine-surface.ts` extracted; `engine-api.ts` imports it
- [x] `npm run docs:api` output byte-identical; `scripts/engine-api.test.ts` green
- [x] `scripts/engine-usage.ts` — program, reference collection, buckets, markdown
- [x] Both self-checks in §6 implemented and throwing
- [x] `scripts/engine-usage.gen.ts` + `docs:usage` script in `package.json`
- [x] `docs/agent/engine-usage.md` generated (commit waits on validation)
- [x] `scripts/engine-usage.test.ts` — drift + structural (every entry covered)
      + classifier/exclusion unit tests
- [x] `AGENTS.md` — name the usage report alongside the API catalog in
      "Discovering engine capabilities"
- [x] `docs/agent/README.md` — `docs:usage` script + the report as the inverse
      view of the API catalog
- [x] `docs/README.md` — index entry for the report
- [x] `docs/twenty-games-challenge.md` — the report is the input for picking the
      next game
- [x] `/memories/repo/engine-capability-discovery.md` updated
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test` (83 files, 1418
      tests), `npx tsc --noEmit` in `examples/snake`
- [x] Peer review → LGTM
- [ ] Move this plan to `docs/plans/done/` in the same commit

## Peer review → LGTM

Two read-only passes (small model, no edits, no `vscode_askQuestions`).

Pass 1, on the plan, returned LGTM *with clarifications*: split the docs
checklist per file, make the ordering/capping contract explicit, pin the
drift-test timeout, and define self-check 2 through the AST rather than a text
grep.

Pass 2, on the implementation, found no correctness, determinism or
documentation issue, and requested one change: isolated unit tests for the
exclusion rules, which the plan had promised. Implemented by extracting
`isSelfConsumption()` as the predicate `collectReferences` actually calls, and
exporting `isPlumbing` / `isImported` / `declarationNameNodes` for a
`reference exclusions` suite. It also flagged that the report header named
`hub` as excluded but not `assets`; the header now names both. Re-review: LGTM.

Verified here: `docs:api` output byte-identical after the `engine-surface.ts`
extraction, `npm run docs:usage` ≈ 1.7 s, `npm test` 83 files / 1422 tests, and
`npx tsc --noEmit` clean in `src/`, `scripts/` and `examples/snake`.
