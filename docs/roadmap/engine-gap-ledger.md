# Engine Gap Ledger

Raw engine gaps surfaced while building the
[`examples/`](../../examples/), **awaiting triage**. A gap is something
`@pierre/ecs` *lacked* that an example had to hand-roll locally, or an
existing engine surface that had to be extended before an example could be
built. Recording every gap in one place gives the "how many consumers hit
this?" question a real answer.

**This file is an inbox, not a record.** A row lives here only while it is
undecided. Triaging it *removes* it: a promotion becomes an entry in
[ecs-module-backlog.md](ecs-module-backlog.md), a rejection becomes a line in
[non-goals.md](non-goals.md), and the closed rows of the last exhaustive pass
are frozen in
[archived/audits/2026-09-21-example-gap-audit.md](../archived/audits/2026-09-21-example-gap-audit.md).
A row that outlives its decision is stale by construction.

## How this works

Two roles, deliberately separated (see
[extending-the-engine.md](../extending-the-engine.md)):

### Gap writer — just built an example

List the gaps you hit. **Symptom only — do not decide what module a gap
becomes.** That decision biases toward your one game's shape, which is
exactly what we keep out of the writer's hands.

- If a matching row already exists, add your example to its **Consumers**
  list (you're saying "I hit the same wall", not making a module call).
- Otherwise add a new row.
- Record how you handled it. **You can always build the example without
  touching the engine** — so the choice is governed by canon, not by whether
  a module already exists:
  - **Kept local (default).** You hand-rolled the missing piece in the
    example and touched nothing in the engine. Add it to the
    [open gaps](#open-gaps-awaiting-triage) table. This is the right call
    unless the capability is established canon.
  - **Promoted.** The capability was clearly canon (standard — the engine
    *ought* to have it), so you added a primitive or extended an existing
    module under the sliding-scale rule. Extending an existing module counts
    too, and carries the **same bar** — "a module already exists" is not a
    licence to put a non-standard one-off into it. Record it in the dated
    audit file for the current pass rather than here.

### Gap triager — separate pass

Read the open gaps, group related ones, and apply the sliding-scale
promotion rule in [extending-the-engine.md](../extending-the-engine.md). For
each gap (or group): promote it into an
[ecs-module-backlog.md](ecs-module-backlog.md) entry, decline it into
[non-goals.md](non-goals.md), or ship the fix. Then **delete the row from
this file** and append it to that pass's dated audit under
`docs/archived/audits/`.

## Status vocabulary

There is only one status here: **Open — recorded, kept local, not yet
triaged.** The terminal states (**Promoted**, **Resolved**, **Rejected**)
are not statuses of a live row, they are the reasons a row left this file.
Their records live in the dated audit files.

## Verification provenance (read before trusting any row)

Every row carries a **Verified @ src** stamp: the exact `file@line` that was
opened to confirm the claim, plus whether the capability is `PRESENT` or
`ABSENT`. This exists because three earlier triage/report passes each carried
forward ~half-false claims — the failure mode was *inferring* a gap from "an
example hand-rolls X" without opening the engine source, then laundering that
inference into more confident downstream docs. The fix is structural, not
"verify harder":

- A row may only assert a gap with a source citation. **No citation → the
  claim is not trustworthy and must be re-verified before acting.**
- The stamp records the API **shape**, not just the capability name — e.g.
  "boundary clamps to `[0,width)` only, no inset", because the
  fit-determining detail lives in the signature, not in prose.
- **Adoption claims need TWO citations, not one.** An "X can adopt Y / X is a
  clean migration / N consumers fit" claim is a **join of two facts**: (1)
  the engine capability's shape, and (2) each consumer's *actual* usage. A
  stamp that points only at `src/modules/...` proves the capability exists,
  **not** that any consumer fits it. So every adopt/fit/clean-swap row must
  carry an engine `file@line` **and**, per named consumer, that example's
  `file@line`. This rule cost the 4th pass a re-do: it stamped only the
  engine side and still listed "flappy, jetpack **wrap**" as boundary
  adopters — opening their `systems.ts` showed size-aware clamps, not wrap.
  Capability-exists ≠ consumer-fits.
- "Ships-but-unadopted" (capability `PRESENT`, consumers hand-roll) is
  recorded distinctly from "genuinely missing" (`ABSENT`). The first is an
  **adoption** follow-up; only the second can justify a new module. And
  "ships-but-**module-private** / wrong-shape-to-adopt" is a **Build**, not
  an adoption — verify the export surface, not just that the logic exists
  somewhere.
- Last exhaustive source-cited pass: **2026-07-15** (every row opened);
  boundary + pointer rows re-verified **dual-sided** (engine + consumer) the
  same day after the single-sided miss above. Rows below stamped after that
  date were verified in the pass named in the row.

## Open gaps (awaiting triage)

The **Consumers** column is the live tally that feeds the
[promotion rule](../extending-the-engine.md); **Verified @ src** is the
provenance stamp (see above). Rows tagged `(audit Bn)` came from the one-time
cross-sectional [examples audit](../archived/example-engine-gap-audit.md);
the rest were grown incrementally. No tagged row is live at present — every
closed one, tagged or not, is frozen under
[archived/audits/](../archived/audits/).

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Entity-lifecycle / tag-change events. No reactive hook, so consumers walk every entity every frame to detect tag (zone) changes. | card-battler | **ABSENT (tags only)**: `LifecycleEvent`@[`lifecycle.ts:13`](../../src/lifecycle.ts) = `EntityCreated/Destroyed/ComponentAdded/ComponentRemoved` — **no `TagAdded/TagRemoved`**. A zone modeled as a *component* WOULD get a reactive hook; card-battler models zones as *tags*, which don't emit. | **Hold** — 1 consumer, deferred (shape not pinned); now covered by the `modules/card-interaction` backlog entry, which must settle the zone model before building. Cheaper workaround on record: model zones as components. |
| Carried-rider adoption — `modules/attach`'s `inheritVelocity` / carrier path has **no confirmed adopter**, so the rider case the module was built for is unexercised. | frogger (original motivation) | **PRESENT (module)**: `AttachDef` + `inheritVelocity` + `makeAttachSystem`@[`attach/attach.ts`](../../src/modules/attach/attach.ts). **ABSENT (adoption)**: a grep of `examples/**` for `AttachDef` finds only asteroids@[`game.ts:131`](../../examples/asteroids/src/game.ts) and spacewar@[`game.ts:173`](../../examples/spacewar/src/game.ts) — both use `snapPosition`/`snapRotation`, i.e. the *follow* case. frogger imports nothing from `modules/attach`. | **Open — adoption.** Two consumers ship-but-don't-exercise the carrier half. Either migrate frogger's log/turtle rider, or record the carrier path as canon-only (no internal consumer) so the claim stops being implied. |

## Related

- [extending-the-engine.md](../extending-the-engine.md) — the promotion
  rule-book (sliding-scale evidence rule; promote-vs-keep-local).
- [ecs-module-backlog.md](ecs-module-backlog.md) — where triaged gaps become
  module entries.
- [non-goals.md](non-goals.md) — where declined gaps land.
- [archived/audits/](../archived/audits/) — frozen closed rows, one file per
  triage pass.
