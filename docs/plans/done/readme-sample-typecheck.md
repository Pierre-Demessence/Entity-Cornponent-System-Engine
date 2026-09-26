# Type-check the README samples

## Problem

Every module's `src/modules/<name>/README.md` is published verbatim as a guide on
the docs site. The TypeScript samples in those READMEs are prose: nothing
compiles them. Five review rounds found **11 defective samples across 8
modules** — a call to a method that does not exist (`world.scheduleSystem`), a
missing required argument (`cellsForAabb(x, y, w, h)`, `cellOfPoint(x, y)`), the
wrong argument type (`vec3AddScaled(vel, GRAVITY, dt)`), components used without
being registered (`getStore` throws), `world.spawn()` called with no template,
and a false claim about `requires` throwing at registration.

They were found by reading, one at a time, against the source. That does not
scale and it does not converge: each pass finds more, and a wrong arity is
exactly what a compiler catches for free.

## Goal

`npm test` fails, naming file and line, when a published sample does not compile
against the real API.

## Requirements

- WHEN a module README contains a `ts` or `typescript` fenced block, THE SYSTEM
  SHALL type-check that block against the engine's real declarations.
- WHEN a block calls a function with the wrong argument count, or accesses a
  member that does not exist on a real engine type, THE SYSTEM SHALL fail and
  name the README and the line within the finalised sample file.
- WHEN a block is a deliberately partial fragment, THE SYSTEM SHALL require an
  explicit, documented exclusion rather than silently skipping it.
- THE SYSTEM SHALL NOT flag pseudo-identifiers that samples never define
  (`world`, `scheduler`, `state`, `coinId`, `CELL_SIZE`, `W`, `H`, `GRAVITY`, …).
- THE SYSTEM SHALL stay fast enough to run on every `npm test` (target: a few
  seconds, no network, no writes outside a temp directory).

## Design

Two files, following the existing generator/test split (`engine-api.ts` +
`engine-api.test.ts`):

- `scripts/readme-samples.ts` — pure: discover `src/modules/*/README.md`, extract
  fenced `ts`/`typescript` blocks with their start line, and return the sample
  list. No compiler, no writes; the test asserts on it directly.
- `scripts/readme-samples.test.ts` — assemble the samples into a
  `ts.Program` and assert zero diagnostics.

### Scope revision: only *runnable* blocks are compiled

The corpus does not match this plan's original assumption that a prelude would
make most samples compile with a handful of exclusions. Of the 99 `ts` blocks:

- **33 are runnable examples** (they `import` from `@pierre/ecs`) — self-contained
  code a reader copies. These are what the compiler checks.
- **40 are `.d.ts`-style signature listings** (`function f(x: T): R;`, no bodies)
  and **26 are cheat-sheets / bare fragments**. These are API *reference*, not
  code; feeding them to a compiler reports "implementation missing" noise, not
  API defects.

So the harness gates on `isRunnable(code)` (has an `@pierre/ecs` import) and
type-checks only those 33, reporting how many reference blocks it skipped so the
skip is visible rather than silent. Verifying the reference blocks and the 41+
inline `` `foo()` `` prose mentions is a *different* tool — a symbol-existence
check against the real exports — tracked as a follow-up in
[`readme-doc-symbol-linter.md`](../readme-doc-symbol-linter.md).

The 11 defects the original review found are already fixed in source; this gate
prevents regressions in the runnable examples.

### Why the TypeScript compiler API rather than spawning `tsc`

The program must be built from strings (samples live inside Markdown), and we
need to control which diagnostics count. The repo already depends on
`typescript`, and `scripts/engine-api.ts` already uses the compiler API
(`ts.createProgram`, `checker`), so this fits the existing shape.

### Making pseudo-identifiers harmless

A sample is a fragment, not a module. Type-checking it verbatim would report
`Cannot find name 'world'` and — worse — the compiler would type `world` as the
error type and **suppress** the very member errors we want, so the approach
matters:

1. **Prelude with real types.** Emit a preamble that declares the common
   owners with their actual engine types:
   `declare const world: EcsWorld; declare const scheduler: Scheduler<any>;`
   With `world` typed as `EcsWorld`, `world.scheduleSystem(...)` is a genuine
   `TS2339` — the defect becomes visible instead of being swallowed.
2. **Two passes for the rest.** Run once, collect `TS2304` (`Cannot find name`)
   and `TS18004` (`{ x }` shorthand with no value in scope) identifiers, then
   re-run with `declare const <name>: any; type <name><…> = any;` lines added for
   each. Anything still failing is a real defect.
3. **Prelude must not shadow real imports.** Declarations are only emitted for
   names the sample does not itself import or declare (they come from the probe's
   `Cannot find name`, so a name the sample imports never appears).

### Runnable examples still bring their own real types

A runnable block imports the symbols under test, so those are checked against the
genuine declarations — no synthetic import injection is needed. Injecting a real
import for every un-imported name was tried and rejected: sample pseudo-identifiers
(`flee`, `wander`, `seek`, `plan`) collide with real engine export names and
produce false positives. Free identifiers therefore stay `any`.

### Ignored diagnostics

- `TS7006` (parameter implicitly `any`, from an un-annotated callback on a stubbed
  host like `canvas.addEventListener((ev) => …)`) is a sample-lint signal, not
  misuse of the engine API.
- `TS2307` for a non-`@pierre/ecs` module (a missing third-party dep) is ignored;
  a mistyped `@pierre/ecs` subpath is kept.

### Exclusions

A hand-maintained list in `readme-samples.ts`, one entry per `{ module, index }`
with a reason string, for a *runnable* block that still cannot compile in
isolation. Only one is needed: `collision-3d#2` reads game component stores and
dereferences their fields, whose types live in the consuming game. The count is
the measure of how many runnable examples remain unverified; reference blocks are
skipped by the runnable gate, not listed here.

## Checklist

- [x] `scripts/readme-samples.ts`: extract fenced `ts`/`typescript` blocks
      (`\`\`\`ts`,`\`\`\`typescript`) with their line numbers; ignore other fences.
- [x] `scripts/readme-samples.ts`: `isRunnable` gate + `{ module, index }`
      exclusion list with a reason per entry.
- [x] `scripts/readme-samples.test.ts`: prelude builder with real engine types
      for `world` and `scheduler`, plus the `TS2304`/`TS18004` two-pass `any`
      fallback; one diagnostic assertion per runnable example, reporting
      `README path:line`; reports the skipped-reference-block count.
- [x] Confirm the runnable examples type-check (32 checked, 1 excluded); fix any
      genuine defects (none remained — the original 11 were already fixed).
- [x] Confirm the test's runtime stays in the low seconds on a cold run (~1.7s).
- [x] File the reference-block / inline-mention verification as a follow-up plan
      (`readme-doc-symbol-linter.md`).
- [x] Add the new scripts to the drift/docs story only if they change a
      generated artifact (they should not — the scripts write nothing).
- [x] Update `docs/agent/README.md` with the new gate and how to add an
      exclusion.
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run docs:site`.
