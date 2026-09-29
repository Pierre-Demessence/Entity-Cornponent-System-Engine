# Optional event flush in `TickRunner`

`TickRunnerOptions.getEvents` is required, so a program with no game event bus
hands the runner a fake `{ flush: () => {} }`. Four examples (boids, critters,
stealth-guard, woodcutter) and the Manual tutorial carry that line. Resolves the
engine-gap-ledger row "Event-less programs hand-roll a no-op flusher".

Decision: make `getEvents` optional. When it is absent the runner skips the
event flush; the world flushes are unchanged. The option's JSDoc warns that a
program *with* a bus must pass it, or its queued events never drain.

## Tasks

- [x] `src/tick-runner.ts`: `getEvents?`, skip the flush when absent; update
      the option JSDoc and the class's ceremony list.
- [x] `src/tick-runner.test.ts`: a runner without `getEvents` ticks and still
      flushes world commands.
- [x] Remove `NOOP_EVENTS` from boids, critters, stealth-guard, woodcutter.
- [x] Tutorial step 6: drop the no-op and its explanation; mention the option
      for programs that have a bus.
- [x] Close the ledger row into a dated audit under `docs/archived/audits/`.
- [x] Regenerate `docs/agent/engine-api.md` and `engine-usage.*` (no diff:
      the catalogs list exports, not option fields).
- [x] Gate: lint, typecheck, test, `docs:site` build, examples typecheck.
- [x] Peer review — no actionable items.
