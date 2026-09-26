# Verify doc symbol mentions against the real API

## Problem

[`readme-sample-typecheck.md`](readme-sample-typecheck.md) compiles the **33
runnable** `ts` blocks in module READMEs (those importing `@pierre/ecs`). It
deliberately does **not** cover the rest of the documented API surface, which is
where most doc rot actually hides:

- **~40 signature-listing blocks** — `.d.ts`-style tables written by hand
  (`function makeFooSystem(opts: FooOptions): SchedulableSystem<TCtx>;`). They
  duplicate the real export signatures and drift when the source changes. The
  compiler is the wrong tool (they are declarations, not runnable code).
- **~41+ inline prose mentions** — `` `world.spawn()` ``, `` `cellOfPoint()` ``,
  `` `ctx.grid.cellsFor()` `` written inside sentences. A cited method that does
  not exist (the `ctx.grid.cellsFor` case in `kinematics-3d`) sails straight
  through the compile gate because it is not in a code block at all.

Both classes are "does the named symbol/member actually exist, with a compatible
shape?" — a **symbol-existence** question, not a **compilation** one.

## Goal

`npm test` fails, naming the README and line, when a module README's
signature-listing block documents a `function`/`class`/`interface`/`type` whose
name is not a public `@pierre/ecs` export — the stale-doc case a renamed or
removed export leaves behind.

## Decision: scope to signature listings (corpus data)

The two candidate sources were measured against the real surface before building:

| Source | Volume | Resolvable to a real export? |
| --- | --- | --- |
| Signature listings | 206 declared names | **200 real**, 6 noise (all `const` locals / a `type State` example) |
| Inline prose `` `foo()` `` | 41 mentions | only 2 of 35 bare calls; the rest are method names (`dispose()`, `play()`) or external refs (`move_toward()`, `preventDefault()`) |

So the signature listings are a near-perfect mirror of the API — a high-value,
low-false-positive target — while inline prose is mostly method/external noise
that a name-existence check cannot resolve without deep context. The marquee
`ctx.grid.cellsFor` case is inside a **non-runnable code fence**, not prose, so a
prose linter would not catch it anyway; it is fixed by hand.

This plan therefore builds the **signature-listing existence check** and defers
the inline-prose linter (see Non-goals).

## Design

- `scripts/readme-symbols.ts` — pure: reuses `moduleSamples()` / `isRunnable()`
  from `readme-samples.ts`, keeps the **signature-listing** blocks (non-runnable
  fences that are a reference table — a bodyless `function foo(): R;` signature or
  a declaration-only `class`/`interface`/`type` block with no executable
  statements), and returns each top-level declared name with its README line. The
  reference-table gate keeps usage examples — which bind/call things and declare
  local illustrative types like `type State = 'a' | 'b'` — out.
- `scripts/readme-symbols.test.ts` — enumerates the public export names from
  `engine-surface`'s `readEntries()` + the checker, and asserts every documented
  name is one of them, reporting `README path:line`. A `SYMBOL_ALLOWLIST` (empty)
  holds any documented-but-intentionally-non-export name with its reason.

The reference-table gate is the false-positive control: measured against the
corpus it yields **77 checked names, zero false positives**, so no allowlist
entries are needed yet.

## Non-goals

- **The inline-prose mention linter.** The data above shows it is mostly
  unresolvable noise; deferred and recorded in
  [`../../roadmap/core-engine-roadmap.md`](../../roadmap/core-engine-roadmap.md) rather
  than built here.
- Signature-*shape* matching (arity / parameter types). Existence only; the shape
  check is a possible later extension.
- Re-flowing or generating the signature-listing blocks from source (a larger
  "generate the Manual API tables" change). This plan only *verifies* them.
- Checking runnable code blocks — already covered by the compile gate.

## Checklist

- [x] `scripts/readme-symbols.ts`: keep signature-listing blocks (bodyless
      function signature or declaration-only) and return each documented name
      with its README line.
- [x] Decide the false-positive control against the real corpus — the
      reference-table gate gives 77 checked names, zero false positives, so
      `SYMBOL_ALLOWLIST` starts empty.
- [x] `scripts/readme-symbols.test.ts`: assert every documented name is a real
      export, reporting `README path:line`.
- [x] Fix the doc defects it surfaces plus the known `kinematics-3d`
      `ctx.grid.cellsFor` (now the real brute-force `ctx.world.getTag` pattern).
- [x] Defer the inline-prose linter to the roadmap.
- [x] Update `docs/agent/README.md` with the second gate.
- [x] Gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run docs:site`.
