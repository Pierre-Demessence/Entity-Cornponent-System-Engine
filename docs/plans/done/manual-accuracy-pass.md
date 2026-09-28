# Manual accuracy pass

A review of the Manual (`website/manual/` plus the core guides it publishes)
found runnable examples that throw, claims the code contradicts, and no check on
authored-page code. This pass fixes the content and adds the checks that would
have caught it.

## Findings being fixed

1. `world.move` throws unless `enableSpatial` was called; the Introduction and
   the tutorial call it without one, so both crash. The underlying rule —
   "positions only through `world.move`" — is stated universally in
   `src/world.md`, `model.md`, `troubleshooting.md` and `tutorial.md`, but it
   only applies to the spatially indexed component.
2. The tutorial claims every snippet is typechecked; only module READMEs are.
3. Troubleshooting's `enableSpatial` entry says a second call may "do nothing"
   (it throws) and omits the required backend argument.
4. `loadJSON` is described as restoring registration order; it loads by name
   over whatever is registered, ignoring unregistered payload keys.
5. Hard-coded counts ("29 prototypes", "42 modules") drift untested.

Smaller: the Manual landing page explains repo layout instead of the reader's
path; `model.md` hand-writes a `ComponentDef` where every other page uses the
factories; snippets reference undefined names (`last`); the required
`TickRunner.getEvents` forces event-less programs to hand-roll a no-op.

## Tasks

- [x] Extend the sample typecheck from module READMEs to every published
      Manual source: core guides (`src/*.md`) and authored pages
      (`website/manual/**`). The tutorial is checked as one concatenated file.
      (`readme-samples.*` renamed to `doc-samples.*`.)
- [x] Add a runtime test that executes the Introduction example and the whole
      tutorial (DOM stubbed), so a throwing walkthrough fails `npm test`.
      Verified red against the pre-fix pages.
- [x] Fix the Introduction and tutorial examples (no `world.move` without a
      spatial index); make the tutorial's "typechecked" claim true.
- [x] Rescope the position rule to the spatially indexed component in
      `src/world.md`, `model.md`, `troubleshooting.md`, `tutorial.md`.
- [x] Rewrite troubleshooting's `enableSpatial` entry (throws on a second
      call; takes a backend), and add a `world.move` threw entry.
- [x] Correct the `loadJSON` description in `src/world.md`,
      `save-and-load.md`, `troubleshooting.md`.
- [x] Drop the hard-coded example and module counts.
- [x] Rewrite the Manual landing page's organisation section for readers.
- [x] `model.md`: define the component with `simpleComponent`.
- [x] Make fragment snippets self-consistent (`debug-overlay.md` `last`;
      state what `fixed-timestep.md` assumes).
- [x] Fix the defects the widened typecheck surfaced: `save-and-load.md`
      constructed the abstract `SaveStorage` and skipped `open()`;
      `scenes.md` had an empty `if` body and reassigned a `const` world, and
      omitted that tags do not transfer.
- [x] Log the `getEvents` no-op gap in the engine gap ledger.
- [x] Update `docs/agent/` and roadmap docs for the new checks.
- [x] Gate: lint, typecheck, test, `docs:site` build.
- [x] Peer review — no actionable items.
