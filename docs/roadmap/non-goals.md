# Non-goals

Decisions **not** to build, recorded so a later "should we build X?" has an
answer instead of a re-litigation. Absence is not self-documenting: a
missing `modules/ui` reads as "forgotten", not "refused".

Two kinds live here, both terminal — neither is a backlog candidate:

- **Declined** — considered and rejected.
- **Superseded** — the problem got solved a different way, so the sketched
  solution is off the table. Distinct from deferred: deferred work is still
  wanted.

Shipped work does **not** belong here (or in the backlog) — it is described
by `src/`, dated by `git log`, and explained by its `plans/done/` plan or
module README.

## Declined

### Entity hierarchy / parenting — full transform propagation — declined

Bevy-style `Parent(Entity)` / `Children` with recursive N-level transform
propagation is declined: it bakes dirty tracking, cyclic-reference guards,
and lifetime-cascade rules into every game whether or not it uses them. The
lightweight follow/carrier slice covers the observed demand and ships as
`modules/attach`. Revisit only if a prototype genuinely needs deep parent
chains.

### Scoring / lives / game-over scaffold — declined

Content, not engine. Each game's scoring rules, life count, and game-over
semantics differ and belong in app state; the primitives they need already
ship (`EventBus` for score events, `modules/save` for high scores). No
reusable shape to extract.

### Visual editor / inspector as part of the engine — declined

This is a code-first engine. A dev-mode inspector panel belongs in
`modules/debug` (scope: diagnose, not author); persistent authoring lives in
content files plus code, per the content-registration pattern. A Unity- or
Godot-style editor is not engine surface here.

### Generic asset pipeline / build plugin — declined

Vite covers the current scale. If a game ships large asset volumes, point
the build at an external tool (TexturePacker, ffmpeg) from a `package.json`
script — no engine involvement.

### Multi-threading / worker-based parallelism — declined

JavaScript's cooperative concurrency means workers need explicit
`structuredClone` across every boundary. For the games this engine targets
(roguelike plus 2D prototypes), single-threaded is plenty. Revisit if a
prototype ships that is genuinely CPU-bound on the main thread. Storage
layout and per-entity GC are a separate open concern — see
[core-engine-roadmap.md](core-engine-roadmap.md).

## Superseded

### `modules/motion` — boundary inset / per-entity size — superseded

The size- and margin-aware clampers that motivated an `inset` /
`halfExtentOf` option on `VelocityIntegrationBoundary` now clamp directly
with `modules/math`'s `clamp` (`clamp(value, half, width − half)`). An
option on `boundary` would express nothing `clamp` does not, so the
extension is off the table rather than deferred. The shipped `clamp` mode
(`integrateBoundary`@`src/modules/motion/motion.ts:51`) keeps pinning the
origin to `[0, width] × [0, height]`, which the full-playfield clampers
adopt as-is.
