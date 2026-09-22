# Dialogue gap — closed row (2026-09-22)

Single-row triage record: the `examples/rpg` dialogue gap, surfaced and closed
in the same session. It was promoted rather than declined, so it never became
a live row in the [engine gap ledger](../../roadmap/engine-gap-ledger.md) —
recorded here instead, per that file's "record it in the dated audit file for
the current pass" rule.

Roles, status vocabulary, and the verification-provenance rule live in the
live inbox. The larger closed set from the cross-sectional pass is frozen in
[2026-09-21-example-gap-audit.md](2026-09-21-example-gap-audit.md).

## Promoted — moved into the backlog

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Dialogue presentation + runner seam — show a box one line at a time, advance/close, and lock gameplay input while open. No engine surface exists, so the consumer hand-rolls a DOM presenter and drives it from the tick loop; there is no interface for a script format or a runner to plug into. | rpg | **ABSENT** — 2026-09-22: the module tree ships no dialogue/presenter surface (nearest neighbours `render-dom`, `scene-transition`, `turn-based`). rpg hand-rolls `DialogueBox`@[`dialogue.ts:6`](../../../examples/rpg/src/dialogue.ts) (`start(name, lines)` / `advance()` / `open`) driven by a flat per-NPC line array `NpcDialogue { name; dialog: string[]; gid }`@[`characters.ts:63`](../../../examples/rpg/src/characters.ts). | **Promoted → backlog `modules/dialogue` (speculative).** Scoped to the presenter + runner *seam* only; the narrative language, script format and VM stay app-side. Not yet buildable: no consumer exercises `choices` or world-gated lines, so the step model is unvalidated, and the cited canon is one verified runtime (inkjs) plus one authoring-pipeline precedent (Yarn) — short of the ≥3-engine unanimity that promotes on canon alone. |
