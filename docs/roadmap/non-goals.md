# Non-goals

Decisions **not** to build, recorded so a later "should we build X?" has an
answer instead of a re-litigation. Absence is not self-documenting: a
missing `modules/ui` reads as "forgotten", not "refused".

Two kinds live here, both terminal — neither is a backlog candidate:

- **Declined** — considered and rejected.
- **Superseded** — the problem got solved a different way, so the sketched
  solution is off the table. Distinct from the backlog's
  `ready` / `deferred` / `speculative`: those are still wanted, this is not.

Shipped work does **not** belong here (or in the backlog) — it is described
by `src/`, dated by `git log`, and explained by its `plans/done/` plan or
module README.

## Declined

### Faster columnar view construction (prototype-accessor flyweight) — declined

The columnar store's `get(id)` materializes a write-through view via
`Object.defineProperties` per call, which makes `world.query` / `get()`
iteration over columnar components slower than the old object store. The
obvious speed-up — a shared prototype with column-backed accessors — is
declined: prototype accessors are **not own-enumerable**, so they silently
break `{ ...view }` spread and `Object.keys(view)`, both of which consumers
rely on. The non-breaking alternative (codegen'd own-accessor objects via
`new Function`) buys speed for a real cost in complexity and CSP-friendliness,
and the shipped `query.ts` fix already removed most view churn (it rejects
non-matches before building any view). Hot loops that need zero-alloc use the
`column()` / `slotOf()` fast path instead. Revisit only if a profiler shows
uniform-API columnar `get`/`query` as a real bottleneck in a shipping game.

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

### Kill-plane / out-of-bounds respawn helper — declined

Content, not engine. portal and doom each check `y < RESPAWN_Y` and respawn
in the tick runner's `onBeforeFlush` — a one-liner over shipped primitives
(`transform` plus `queueDestroy`). Recorded from the gap ledger's kill-plane
row so the tally stops accumulating.

### Pickup / collectible-on-overlap — declined

Composes from shipped primitives, and one consumer already proves it:
platformer's pickup is `makeTriggerSystem` with an `onOverlap` callback that
emits a `CoinCollected` event@`examples/platformer/src/systems/pickup.ts:20`.
doom hand-rolls the same overlap → apply → despawn flow. The remaining work
is an **adoption** follow-up (migrate doom onto `makeTriggerSystem`), not a
module.

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
