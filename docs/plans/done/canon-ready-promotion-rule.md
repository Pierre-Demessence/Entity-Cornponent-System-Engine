# Canon = Ready: Promotion Rule + Module-Backlog Status Rework

## Problem

The module backlog's status vocabulary answers two independent questions with
one word:

1. **Is the shape proven?** — a fact about the API. External canon answers it.
2. **Does a consumer need it yet?** — a fact about demand. Internal consumers
   answer it.

Because the two are blended, a primitive whose shape ships in Unity *and*
Godot *and* Bevy, but which no `examples/*` prototype happens to call, is
filed as `speculative` — which reads as *"we doubt this belongs in a game
engine."* The backlog contradicts itself in places: `modules/render-target`
states its canon "clears the 0-consumer bar" and then keeps a waiting status.

The rule-book ([`extending-the-engine.md`](../../extending-the-engine.md)) already
says canon substitutes for consumers and already warns that reflexive
under-promotion is *the* failure mode this project suffers from — but that
guidance is buried in a subsection, is phrased as a *permission* rather than an
*authorization*, and the `Trigger` field in the backlog gives it no place to
land. The net effect is an agent behaviour of "defer X, only one example
consumer" applied even when canon has already settled the shape.

## Solution

Not a rewrite of the rule — a clarification of its canon tier plus a missing
status.

### Two axes, one new status

- **Shape proven** (canon ≥3 engines, or solid canon + 1 consumer, or ≥2
  consumers) ⇒ **Ready**. Built when there is a build slot; the remaining gate
  is scheduling or effort, never evidence.
- **Shape believable but unproven** ⇒ **Deferred**. A named *shape* trigger
  would prove it.
- **Shape undetermined / canon split** ⇒ **Speculative**.

### Rule changes (`extending-the-engine.md`)

1. Canon is a **shipping authorization**: unanimous canon ⇒ status **Ready**,
   explicitly not Deferred/Speculative.
2. Split the two jobs: **canon proves the shape; one cheap wiring proves
   integration with this core.** No "2–3 demos" for canon.
3. Tie-break for the 2-consumer rule: the only question is whether ≥2 major
   engines ship the *same API shape*. If yes ⇒ canon, ≤1 consumer.
4. Elevate the anti-under-promotion warning to a top-level heading.
5. Add **Failure mode 3: the slice-V1** (canon subsystem shipped as "whatever
   the first consumer called" returns as V2/V3 backlog).
6. Promotion workflow step 1 restated in the new vocabulary.

### Kept guardrails

- **Citation stays mandatory** — canon must be named and checkable; an
  asserted "Unity does it" is not canon.
- **Primitive vs feature filter** — canon applies to primitives, not authoring
  tools or workflow layers over a shipped module.

## Reclassification rule applied to the backlog

An entry becomes **Ready** iff ≥3 major engines ship the same *primitive*
shape (cited in the entry). Solid-but-not-unanimous canon with no consumer
stays **Deferred**; split canon stays **Speculative**.

## Checklist

- [x] `docs/plans/canon-ready-promotion-rule.md` created
- [x] `extending-the-engine.md`: canon = Ready authorization
- [x] `extending-the-engine.md`: shape-vs-integration split
- [x] `extending-the-engine.md`: 2-consumer tie-break
- [x] `extending-the-engine.md`: anti-under-promotion elevated to top level
- [x] `extending-the-engine.md`: Failure mode 3 (slice-V1) added
- [x] `extending-the-engine.md`: Promotion Workflow + Signals updated
- [x] Backlog: charter + status vocabulary reworked (Ready added)
- [x] Backlog: entry-shape requires a shape-vs-scheduling trigger label
- [x] Backlog: status-at-a-glance index added
- [x] Backlog: canon entries reclassified to Ready
- [x] Backlog: promotion-trigger summary table reworked
- [x] Cross-references updated (`AGENTS.md`, `non-goals.md`)
- [x] `scripts/docs.test.ts` status vocabulary + structural allow-list updated
- [x] Peer review pass with no actionable items
- [x] Plan moved to `docs/plans/done/`
