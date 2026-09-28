# Docs-site roadmap

Open work on the published site (`website/`) and the Manual it generates.
Shipped work is not listed here; `README.md` and the plans under
`docs/plans/done/` are the record. Engine work is not here either — see the
[core-engine roadmap](core-engine-roadmap.md), the
[ECS module backlog](ecs-module-backlog.md) and the
[engine gap ledger](engine-gap-ledger.md).

Scope: the Manual's page types, and defects in the built site.

Per-primitive guide coverage is deliberately out of scope. 13 core sources have
no same-named guide and none is planned, for reasons that differ per file: two are
covered by `src/tick.md` (`tick-source.ts`, `tick-runner.ts`), one is a barrel
(`index.ts`), two are storage internals behind `ComponentStore` and `Query`
(`archetype-index.ts`, `column-store.ts`), five are interface contracts of 2-26
lines (`entity-id.ts`, `lifecycle.ts`, `input-source.ts`, `renderer.ts`,
`audio-provider.ts`), and three are small utilities (`validation.ts`,
`plugin.ts`, `test-utils.ts`).

## The Manual

The Manual's guides are one-per-thing: eight core-primitive guides
(`src/<name>.md`) and 42 module guides (`src/modules/*/README.md`). The pages
that span primitives are authored in `website/manual/` and reach the sidebar as
the **Getting started**, **Concepts** and **Guides** groups.

Nothing open. The page types the Manual was missing are shipped, and
`docs/plans/done/manual-restructure.md` is the record of how.

Candidate, not yet wanted:

- **Examples as a top-level section** — its own sidebar and header link beside
  Manual and API reference. Justified once there is a page per example; the
  gallery ships inside the Manual first.
