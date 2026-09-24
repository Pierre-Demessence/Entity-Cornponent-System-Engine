# modules/math-3d — `vec3MoveToward` (vector form)

Ship the 3D half of move-toward in the same pass as the 2D
`modules/motion — moveToward` plan (`docs/plans/modules-motion-move-toward.md`,
separate commit — different module).

**Why this is in scope.** `src/modules/math-3d` is the declared 3D sibling of
`src/modules/motion/vec` (`src/modules/math-3d/README.md:8`), and the project
rule is that dimension-sensitive work ships as parallel siblings. Shipping the
2D helper alone would immediately re-create the *slice-V1* failure mode — a
canon-complete surface minus one operation — which is the exact thing the
backlog conventions exist to prevent. `vec3ScaleToLength` is the nearest
neighbour today, and it is not the same operation.

If this plan is **not** built alongside the 2D one, add a matching
`modules/math-3d — vec3MoveToward (vector form)` entry to the backlog's
Existing-module gaps so it does not exist only inside a plan.

## Decisions (mirror the 2D plan exactly)

- `vec3MoveToward(current: Vec3, target: Vec3, delta: number): Vec3`.
- Return `target` when the distance is `<= delta` — no drift, no overshoot.
- Non-positive `delta` returns `current`; zero distance returns `target`.
- Pure, allocation-returning, **depends on nothing**; no normalization of
  degenerate input to `NaN`.

## Checklist

- [x] Add `vec3MoveToward` to `src/modules/math-3d/vec3.ts`.
- [x] Export it from `src/modules/math-3d/index.ts`.
- [x] Colocated tests in `vec3.test.ts`, mirroring the 2D cases (partial step,
      exact arrival, overshoot, zero distance, `delta = 0`, negative `delta`).
- [x] `src/modules/math-3d/README.md` — add to the API block and note the
      parity with `modules/motion`'s `moveToward`.
- [x] `docs/roadmap/ecs-module-backlog.md` — only if this plan ships *without*
      the 2D one: add the entry instead of removing one. **Not applicable** —
      the 2D plan shipped first (`7a8d86d`), so no gap entry is created.
- [x] `npm run docs:api`.
- [x] `npm run lint` + `npm test`.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.

## Shape notes

- The two implementations must agree on every degenerate case, since they are
  documented as siblings; keep the tests deliberately parallel so a future
  change to one shows up as a failing twin.
