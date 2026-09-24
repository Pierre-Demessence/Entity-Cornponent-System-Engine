# Typecheck Gate — enforce `tsc --noEmit`, clear 23 latent errors

`tsc --noEmit` reports **23 errors in 7 files**. Nothing in the repo runs it.

- No `tsc` / `typecheck` npm script exists (`npm run tsc` → `Missing script`).
- `.github/workflows/ci.yml` runs `npm run lint` and `npm test` only.
- `.husky/pre-commit` runs `lint-staged` (ESLint `--fix`); `.husky/pre-push`
  runs `npm test`.
- ESLint is configured without `parserOptions.project` / `projectService`, so
  `@antfu/eslint-config`'s `typescript: true` applies syntax rules, not
  type-aware rules — it cannot see a TS2xxx error.
- `vitest.config.ts` sets no `test.typecheck`, so Vitest transpiles (oxc)
  without checking.

Every gate can be green while the type graph is broken. That is how the errors
accumulated: `Renderable` was already a 5-member discriminated union when the
animation assertions that read `r.frame` landed (`378d4b8`), so those errors
were introduced broken and never caught.

`docs/agent/README.md` lists `npx tsc --noEmit` as a script to run, which is
the check being claimed on paper and enforced nowhere.

## Impact

All 23 errors are in `*.test.ts` files. `src/**` excluding tests type-checks
clean, and consumers (`examples/*`, `Roguelike/`) compile only what their
imports reach, so no consumer build is affected. This is repo hygiene, plus
proof for two groups that a source change never propagated to its test.

## Root causes

| Group | Files | Errors | Cause |
|---|---|---|---|
| `Renderable` union not narrowed | `animation/sprite-animation.test.ts` (163, 173–175, 197), `tilemap/spawn.test.ts` (128–129, 139–140, 150–151, 161–162, 218–219), `particles/particles.test.ts` (55) | 16 | `ComponentDef<Renderable>` makes `get()` return the full union. `expect(r.kind).toBe('sprite')` is a call, not a type guard, so it does not narrow. |
| `Call` union property access | `render-canvas2d/render-canvas2d.test.ts` (1170–1171) | 2 | `fillStyle` does not exist on every member of the recorder's `Call` union. |
| Harness typed against the concrete store | `render-dom/dom-renderer.test.ts` (108–110) | 3 | `world.registerComponent()` returns `ComponentStoreLike<T>` since the SoA storage change (`0470c3d`); `TestHarness` still declares `ComponentStore<T>`. |
| `unknown[]` button array | `input/gamepad-provider.test.ts` (47) | 1 | `Array.from({ length: 17 }).fill(0)` infers `unknown[]`, not `number[]`. ESLint's `e18e/prefer-array-fill` prefers this exact broken form over the typed alternative. |
| Tileset fixture predates a required field | `tmx/tmx.test.ts` (291) | 1 | `TmxTileset.name` became required in `caa5390`; the fixture was not updated. |

## Approach

Fix each test at its own boundary; no source change is needed.

- Discriminated unions: a small local narrowing helper per test file
  (`asSprite` in the animation and tilemap tests, `asRect` in the particles
  test) that throws on the wrong `kind`. Local rather than shared because
  `src/test-utils.ts` is public API and widening it would be a consumer-facing
  change for a test-only concern.
- Recorder calls: assert the two `fillRect` calls with `toEqual`, matching the
  style of the neighbouring screen-space test, which also removes the property
  access.
- `TestHarness`: retype to `ComponentStoreLike<T>`. Only `.set` / `.delete` are
  used, both on the interface.
- Button array: `Array.from<number>({ length: 17 }).fill(0)`. The bare
  `Array.from({ length: 17 })` overload infers `unknown[]`, and the
  callback form that would infer `number[]` is rejected by
  `e18e/prefer-array-fill` — the type argument satisfies both.
- Then add the gate: a `typecheck` script, a CI job, a `pre-push` step, and
  the doc correction.

`pre-commit` stays `lint-staged` only — `tsc` is too slow for the commit path,
and the commit is the wrong place to block on a repo-wide check.

## Subtasks

- [x] Narrow `Renderable` in `animation/sprite-animation.test.ts`,
      `particles/particles.test.ts`, `tilemap/spawn.test.ts` (16 errors)
- [x] Assert `fillRect` calls with `toEqual` in `render-canvas2d.test.ts`
      (2 errors)
- [x] Retype `TestHarness` to `ComponentStoreLike` in `dom-renderer.test.ts`
      (3 errors)
- [x] Pass a typed array to `pad()` in `gamepad-provider.test.ts` (1 error)
- [x] Add `name` to the `TmxTileset` fixture in `tmx.test.ts` (1 error)
- [x] Add `"typecheck": "tsc --noEmit"` to `package.json` scripts
- [x] Add a `typecheck` job to `.github/workflows/ci.yml`
- [x] Gate `.husky/pre-push` on `npm run typecheck && npm test`
- [x] Correct `docs/agent/README.md`: `npm run typecheck` instead of the bare
      `npx` command, `pre-push` hook description, drop the stale frontmatter
- [x] Install `@types/node`, matching the CI runtime (Node 22)
- [x] Add `tsconfig.node.json` covering `scripts/` and the root configs
- [x] Run both projects from `npm run typecheck`
- [x] `npm run typecheck`, `npm run lint` and `npm test` all clean
- [x] Peer-review pass returns no actionable items

## Second project: `scripts/` and the root configs

`tsconfig.json` has `include: ["src"]`, so `scripts/**`, `eslint.config.ts`
and `vitest.config.ts` sat outside every gate. Measured by pointing a
throwaway config at them, they failed with 16 errors from a single root
cause: `@types/node` was not installed and the root `types` is
`["vite/client"]`, so `node:fs` / `node:path` / `node:url` did not resolve
(`vitest.config.ts` also failed on `__dirname`).

`tsconfig.node.json` extends the root config, overrides `types` to `["node"]`
and `lib` to `["ES2023"]` — the scripts are Node-only and must not see DOM
globals — and includes `["scripts", "*.config.ts"]`. `npm run typecheck` now
runs both projects. That split is what keeps Node globals out of `src/`, which
stays browser-targeted.

No source change was needed: the 16 errors were entirely the missing types.
`--listFiles` confirms the project compiles exactly those six files and no
`src/` file.

## What this gate still does not cover

- **The 29 `examples/*` workspaces.** Each already runs
  `tsc --noEmit && vite build` in its own `build` script, but CI never invokes
  it, so none of them are checked on push. Closing this is a workflow matrix
  job, and it has no durable home today — the roadmap docs cover core internals
  and modules, not build/CI tooling.
- **Type-aware ESLint.** Adding `parserOptions.projectService` would surface
  type information to ESLint, which is a larger ruleset conversation than
  "stop shipping broken types".
