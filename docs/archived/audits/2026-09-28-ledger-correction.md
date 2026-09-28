# Ledger correction — closed row (2026-09-28)

One row left the
[engine gap ledger](../../roadmap/engine-gap-ledger.md) outside a
cross-sectional pass: its recorded evidence had gone stale, and the symptom it
described does not match the consumer it cited.

Roles, status vocabulary, and the verification-provenance rule live in the live
inbox. The larger closed sets are frozen in
[2026-09-21-example-gap-audit.md](2026-09-21-example-gap-audit.md) and
[2026-09-22-incremental-triage.md](2026-09-22-incremental-triage.md).

## Resolved — capability present, symptom misattributed

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Entity-lifecycle / tag-change events. No reactive hook, so consumers walk every entity every frame to detect tag (zone) changes. | card-battler | **PRESENT** (re-verified 2026-09-28). `LifecycleEvent` ships all six variants, tag events included — `TagAdded` / `TagRemoved`@[`lifecycle.ts:18-19`](../../../src/lifecycle.ts) — and both are emitted by `registerTag`@[`world.ts:357,361`](../../../src/world.ts). The row's stamp cited `lifecycle.ts:13` and asserted no tag events. | **Closed.** Two independent errors: the cited absence is false, and the described symptom is not what the consumer does. card-battler's per-frame zone walk is a *render* pass — it iterates the hand/deck/discard tags to draw each card and to reconcile its DOM nodes@[`render.ts:238-247`](../../../examples/card-battler/src/render.ts), `@:296-315`; no event can replace that. The consumer never touches the bus: `world.lifecycle` appears in no card-battler file, and the only `lifecycle` string there is a `// --- Lifecycle ---` section header@[`render.ts:81`](../../../examples/card-battler/src/render.ts). The tag-vs-component zone representation is still card-battler's to settle, and stays recorded on the `modules/card-interaction` entry. |
