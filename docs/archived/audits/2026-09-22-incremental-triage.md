# Incremental triage — closed rows (2026-09-22)

Rows closed outside a full cross-sectional pass: the `examples/rpg` dialogue
gap (promoted), and two trivial 2026-07-18 rows (rejected). None became a live
row in the [engine gap ledger](../../roadmap/engine-gap-ledger.md) — recorded
here instead, per that file's "record it in the dated audit file for the
current pass" rule.

Roles, status vocabulary, and the verification-provenance rule live in the
live inbox. The larger closed set from the cross-sectional pass is frozen in
[2026-09-21-example-gap-audit.md](2026-09-21-example-gap-audit.md).

## Promoted — moved into the backlog

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Dialogue presentation + runner seam — show a box one line at a time, advance/close, and lock gameplay input while open. No engine surface exists, so the consumer hand-rolls a DOM presenter and drives it from the tick loop; there is no interface for a script format or a runner to plug into. | rpg | **ABSENT** — 2026-09-22: the module tree ships no dialogue/presenter surface (nearest neighbours `render-dom`, `scene-transition`, `turn-based`). rpg hand-rolls `DialogueBox`@[`dialogue.ts:6`](../../../examples/rpg/src/dialogue.ts) (`start(name, lines)` / `advance()` / `open`) driven by a flat per-NPC line array `NpcDialogue { name; dialog: string[]; gid }`@[`characters.ts:63`](../../../examples/rpg/src/characters.ts). | **Promoted → backlog `modules/dialogue` (speculative).** Scoped to the presenter + runner *seam* only; the narrative language, script format and VM stay app-side. Not yet buildable: no consumer exercises `choices` or world-gated lines, so the step model is unvalidated, and the cited canon is one verified runtime (inkjs) plus one authoring-pipeline precedent (Yarn) — short of the ≥3-engine unanimity that promotes on canon alone. |

## Rejected — declined, not engine surface

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Kill-plane / out-of-bounds respawn — relocate an entity to its spawn when it falls past a Y threshold. | portal, doom | **ABSENT** (trivial) — 2026-07-18: both check `y < RESPAWN_Y` → respawn in the tick runner's `onBeforeFlush` (portal@[`main.ts`](../../../examples/portal/src/main.ts), doom@[`main.ts`](../../../examples/doom/src/main.ts)). | **Rejected → [non-goals.md](../../roadmap/non-goals.md) (declined).** Content, not engine — a one-liner over `transform` + `queueDestroy`, with no reusable shape to extract. |
| Pickup / collectible-on-overlap — touch an entity to apply an effect (heal / ammo) then despawn. | doom, platformer | **PRESENT (composed) — verified 2026-09-22:** platformer already builds it from the shipped trigger system — `makeTriggerSystem` with an `onOverlap` that emits `CoinCollected`@[`pickup.ts:20`](../../../examples/platformer/src/systems/pickup.ts). doom hand-rolls the same overlap → apply → `queueDestroy` flow@[`pickup.ts`](../../../examples/doom/src/systems/pickup.ts). | **Rejected → [non-goals.md](../../roadmap/non-goals.md) (declined).** The 2026-07-18 note guessed "platformer also has pickups (unverified here)" — verified here, and it is the **adoption** case, not a missing module. Follow-up: migrate doom onto `makeTriggerSystem`. |
