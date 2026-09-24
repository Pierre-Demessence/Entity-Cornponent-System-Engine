# modules/math-3d — `quatSlerp`

Close the `modules/math-3d — quatSlerp` gap (**Existing-module gaps**, ready).
Canon-unanimous (Unity `Quaternion.Slerp`, Godot `Quaternion.slerp`, three.js
`Quaternion.slerp`), so it is authorized with **0 consumers** — the one call
site today (`examples/starfighter/src/render.ts:203`) already holds a three.js
`Quaternion` and calls its own `slerp`.

## Decisions (settled before building)

- **`t` is unclamped.** Unity clamps to `[0, 1]`; Godot and three.js do not.
  The repo's universal convention is unclamped interpolation with a separate
  bounder — `lerp` (`src/modules/math/math.ts:20` "Unclamped: `t` may exit
  `[0, 1]`"), `lerpAngle` (:79), `remap` ("Unclamped — compose with
  `clamp`/`clamp01`"), and `vec3Lerp` (`src/modules/math-3d/README.md`).
  Coherence with the repo wins over matching one engine.
- **Shortest path.** Negate `b` when `dot(a, b) < 0` before interpolating
  (three.js and Godot both do this) so the rotation never takes the long way
  round.
- **Nearly-parallel fallback.** When `dot >= 1 - 1e-6`, fall back to a
  normalized component-wise lerp (nlerp) instead of dividing by `sin(theta)`.
  Keep it inline — do not add a `vec4` lerp helper for one call site.
- **Inputs must be unit-length.** No normalization inside: the module's stated
  rule is "rotations must be unit-length" (`quatRotate`, `quatMul` behave the
  same way), so normalize at the boundary and document it.

## Checklist

- [x] Add `quatSlerp(a: Quat, b: Quat, t: number): Quat` to
      `src/modules/math-3d/quat.ts`.
- [x] Export it from `src/modules/math-3d/index.ts`.
- [x] Colocated tests in `quat.test.ts` — endpoints (`t = 0` → `a`, `t = 1` →
      `b`), midpoint of a known 90° pair, `dot < 0` shortest-path case,
      identical-inputs case, and unclamped extrapolation (`t = 2`).
- [x] `src/modules/math-3d/README.md` — add to the API block, add a convention
      bullet for unclamped `t` / shortest path, and **remove `quatSlerp` from
      "Not included"**.
- [x] `docs/roadmap/ecs-module-backlog.md` — drop the `quatSlerp` entry and
      its row in the status table (shipped work does not live in the backlog).
- [x] `npm run docs:api` (the drift test fails `npm test` otherwise).
- [x] `npm run lint` + `npm test`.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.

## Shape notes

- Pure `(Quat, Quat, number) → Quat`, no ECS coupling, no imports beyond this
  module's own `vec3` helpers.
- Degenerate zero-quaternion input follows the module's existing convention
  (`quatNormalize` → identity), not `NaN`.
