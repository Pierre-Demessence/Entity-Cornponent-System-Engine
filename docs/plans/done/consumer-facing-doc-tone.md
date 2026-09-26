# Consumer-facing documentation tone

Shift the published docs — the Manual (module `README.md` files) and the API
reference (JSDoc on public exports) — from an internal design-review tone to a
confident, consumer-facing product tone.

## Problem

The published surface is full of design-justification framing that belongs in
governance docs, not in front of a user:

- `## Canon` sections and `Canon: Godot/Unity/Bevy …` prose lines that argue for
  a primitive's right to exist.
- Backlog status vocabulary leaking into the Manual: `marked **ready**`,
  `solid canon`, `engine-canon shape`, `canon-complete counterpart`.

No published engine documents a feature by defending the decision to build it.

## Root cause

`AGENTS.md` sanctions "canon" as the *promotion* vocabulary (the 0/1/2-consumer
rule in `docs/extending-the-engine.md`) and even models the `Godot/Unity/Bevy`
justification format. Each module ships with a `docs/plans/<feature>.md` that
legitimately uses that line to justify building it — and the agent then copies
the justification straight into the shipped JSDoc/README. New modules imitate
the last one, so it self-propagates.

## Rules applied

1. **Describe, don't justify.** README/JSDoc say what the thing is and how to use
   it. No `Canon:` lines, no `## Canon` sections, no consumer-count / backlog
   status.
2. **Cross-engine references only as reader help.** Keep an engine name only
   where it is a genuine porting caveat or familiarity bridge (e.g. "left-handed,
   e.g. Unity"), framed as help to the reader — never as proof the API belongs.
3. **Keep standard terminology "canonical".** Mathematical / CS usage (canonical
   Perlin gradients, canonical defaults) is unrelated to the governance term and
   stays.
4. **Governance docs are untouched.** `AGENTS.md`, `docs/extending-the-engine.md`,
   `docs/plans/**`, `docs/roadmap/**`, `docs/archived/**`, and top-level
   `docs/*.md` keep "canon" — it is load-bearing there.

## Scope

- In: `src/modules/**/README.md`, JSDoc in `src/**/*.ts` (core + modules).
- Out: `examples/**` (consumers, not published), internal governance docs, tests.

## Checklist

- [x] Add the authoring guardrail to `AGENTS.md`
- [x] Sweep module `README.md` files
- [x] Sweep JSDoc source files
- [x] Regenerate `docs/agent/engine-api.md` (`npm run docs:api`) + manual
- [x] Run docs drift tests + lint + build
- [x] Peer review pass
