# Plan: engine API-surface index (capability discovery)

**Status:** validated; awaiting commit

## Problem

As the engine grows, an agent authoring a *consumer* (example/game) has no
one-read map of what the engine can do — discovery costs ~24 README reads, so
it guesses and reinvents helpers that already exist (→ false-positive gaps in
the ledger). Per-module READMEs are *reference* docs; what's missing is a
*discovery* index of the public surface.

## Decision (with user)

Build a **lightweight generated index** (chosen over TypeDoc / code-review-graph
/ hand-written): a terse one-line-per-symbol catalog generated from the
`package.json` `exports` map + JSDoc, plus a workflow rule to consult it.

- Generator uses the TypeScript compiler API (`typescript` is already a devDep;
  run via `jiti`, also a devDep — no new dependency).
- Output `docs/agent/engine-api.md`, committed, drift-guarded by a vitest test.
- Source of truth = `exports` + JSDoc summaries (resolves re-export aliases).

## Deliverables

- [x] `scripts/engine-api.ts` — pure `generateEngineApiMarkdown()` (compiler API)
- [x] `scripts/engine-api.gen.ts` — CLI writer
- [x] `scripts/engine-api.test.ts` — drift guard (regen == committed)
- [x] `docs/agent/engine-api.md` — generated output (committed)
- [x] `package.json` — `"docs:api": "jiti scripts/engine-api.gen.ts"`
- [x] `vitest.config.ts` — add `scripts/**/*.test.ts` to `include`
- [x] `AGENTS.md` + `docs/agent/README.md` — "consult engine-api.md before
      hand-rolling in a consumer; regenerate when changing exports" rule
- [x] `/memories/repo/` note pointing future agents at the index
- [x] Lint + full test green
- [x] Peer review -> LGTM
- [ ] Move plan to `docs/plans/done/` in same commit

## Peer review -> LGTM

Reviewer confirmed: catalog is a **strict superset** of the `@pierre/ecs` root
(skipping `.` drops nothing — `src/index.ts` is re-exports only; proven by
subpath-only symbols like `SchedulerOptions` + the `test-utils` set); alias
re-exports resolved correctly (math's 12 fns render with original JSDoc); drift
guard is sound + deterministic (pure import, no timestamps, eslint `docs/**`
ignored so the md is never reformatted); security clean (reads local files only).
Fixed 4 nits: ICU-independent comparator (was `localeCompare`), throw on a
missing entry file (completeness self-check), strip `{@link}` tags from
summaries, soften the header's root-reexport claim. Left N3 (scripts not in
`tsc` — acceptable for dev tooling) and N5 (ENOENT message — marginal).
