# Ledger closure — optional event flush (2026-09-29)

One row left the
[engine gap ledger](../../roadmap/engine-gap-ledger.md) outside a
cross-sectional pass: it was triaged and built in the same change.

Roles, status vocabulary, and the verification-provenance rule live in the live
inbox. The larger closed sets are frozen in
[2026-09-21-example-gap-audit.md](2026-09-21-example-gap-audit.md) and
[2026-09-22-incremental-triage.md](2026-09-22-incremental-triage.md).

## Promoted — built

| Gap (symptom) | Consumers | Verified @ src | Notes |
|---|---|---|---|
| Event-less programs hand-roll a no-op flusher — `TickRunner` requires `getEvents`, so a scene with no event bus must invent `{ flush: () => {} }` to start a tick loop. | boids, critters, stealth-guard, woodcutter (each defined an identical `NOOP_EVENTS`); the Manual tutorial, step 6 | **ABSENT** at triage: `getEvents` was a required field of `TickRunnerOptions`@`tick-runner.ts:25`, called unconditionally@`tick-runner.ts:88`. | **Closed — built.** `getEvents` is optional; the runner skips only the event flush when it is absent, and the world flushes run unchanged ([`tick-runner.ts`](../../../src/tick-runner.ts)). The option's JSDoc warns that a bus the runner is not given never drains. All four `NOOP_EVENTS` copies and the tutorial's no-op are removed. Declined alternative: exporting a shared no-op constant, which removes the duplication but still asks an event-less program to wire something it does not use. |
