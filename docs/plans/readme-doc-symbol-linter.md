# Verify doc symbol mentions against the real API

## Problem

[`readme-sample-typecheck.md`](done/readme-sample-typecheck.md) compiles the **33
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

`npm test` fails, naming the README and line, when a module README names an
`@pierre/ecs` export (or a member of one) that does not exist — in a signature
listing or in inline prose.

## Requirements

- WHEN a README's prose contains a backticked call `` `name(...)` `` or member
  `` `Owner.member(...)` `` whose `name` / `member` is presented as an engine
  symbol, THE SYSTEM SHALL verify it against the real exported surface and fail
  naming the README and line when it does not exist.
- WHEN a signature-listing block names an exported function/class/type, THE
  SYSTEM SHALL verify that export exists (and, where feasible, that the arity /
  shape matches the real declaration).
- THE SYSTEM SHALL NOT flag genuine prose that is not an API claim (English words
  in backticks, game-specific identifiers, pseudo-code) — it needs an explicit,
  documented allowlist or a conservative match rule, mirroring how the compile
  gate stubs pseudo-identifiers.
- THE SYSTEM SHALL reuse the existing export enumeration in
  [`scripts/engine-surface.ts`](../../scripts/engine-surface.ts) (the source of
  truth for [`docs/agent/engine-api.md`](../agent/engine-api.md)) rather than a
  second, drifting list.
- THE SYSTEM SHALL stay fast enough for every `npm test` (no network, no writes
  outside a temp dir).

## Design sketch (to be refined when picked up)

- A `scripts/readme-symbols.ts` pure module: strip fenced code, extract
  backticked call/member mentions, and (separately) parse signature-listing
  blocks for the exports they name.
- A `scripts/readme-symbols.test.ts` that resolves each mention against the
  `engine-surface` symbol table + the type checker (for member existence on a
  named type) and asserts none are unresolved outside the allowlist.
- The false-positive control is the hard part: prose backticks are noisy. Options
  to weigh — only check mentions that resolve to a *known* export name (so an
  unknown word is ignored, but a real export used with a wrong member is caught),
  vs. an explicit allowlist of non-API backticked terms. Decide against the real
  corpus, as the compile gate's approach was decided.

## Non-goals

- Re-flowing or generating the signature-listing blocks from source (a larger
  "generate the Manual API tables" change). This plan only *verifies* them.
- Checking runnable code blocks — already covered by the compile gate.

## Checklist

- [ ] `scripts/readme-symbols.ts`: extract inline `` `name(...)` `` /
      `` `Owner.member(...)` `` mentions from prose (code fences stripped).
- [ ] `scripts/readme-symbols.ts`: parse signature-listing blocks for named
      exports.
- [ ] Decide + implement the false-positive control (allowlist vs known-export
      match) against the real corpus.
- [ ] `scripts/readme-symbols.test.ts`: assert every API mention resolves,
      reporting `README path:line`.
- [ ] Fix the doc defects it surfaces (starting with `kinematics-3d`'s
      `ctx.grid.cellsFor`).
- [ ] Gates: `npm run lint`, `npm run typecheck`, `npm test`, `npm run docs:site`.
