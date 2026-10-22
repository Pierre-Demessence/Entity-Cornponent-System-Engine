# Plan: core 3.11 single-move structural changes + render-canvas2d sprite cull

Two independent performance fixes surfaced by the SpaceShooter profile
(~1000 spawns plus destroys per tick, `moveEntity` at 17% of all CPU). Part A
and Part B share no code and can land in either order, in separate commits.

## Goal

- **A (core 3.11).** Creating an entity and giving it N components or tags, or
  destroying an entity that holds N, costs **one** archetype-bucket move instead
  of N, with no public API change.
- **B (render-canvas2d).** With a `view` set, off-screen `sprite` renderables are
  culled like `rect` and `circle` already are.

## Part A: single-move structural changes

### Why it is slow today

- Every component `set` and tag `add` fires a store subscriber
  (`src/world.ts:537`, `src/world.ts:575`) that calls `ArchetypeIndex.addBit`
  (`src/archetype-index.ts:31`), which calls `moveEntity`
  (`src/archetype-index.ts:92`) immediately. SpaceShooter's `spawnProjectile`
  (`createEntity` + 9 `set` + 1 tag `add`) therefore moves the entity through 10
  buckets: `{P}`, `{P,V}`, `{P,V,S}`, …
- Each intermediate bucket usually holds no other entity, so it is **created
  and then emptied** within the same spawn. Both bump `structuralVersion`
  (`src/archetype-index.ts:106`, `:152`), so every `Query` re-runs
  `selectBuckets` (string key + scan of all buckets, `:161`) on its next pass.
  The move cost and the cache invalidation are one problem.
- `destroyEntity` (`src/world.ts:182`) deletes rows store by store; each delete
  fires `removeBit` (`:125`) and moves the entity down through N shrinking
  signatures before `removeEntity` (`:135`) drops it.

### Approach: deferred bucket commit inside `ArchetypeIndex`

Bit changes update the entity's **signature** immediately but its **bucket
placement** lazily. The index remembers, for each entity touched since the last
commit, which bucket it currently sits in; every read of bucket state commits
all pending entities first, each with at most one bucket move.

Why this over an explicit bundle API (`world.spawnWith(...)`, a builder, Bevy
bundles): it fixes every existing call pattern at once — `createEntity` + `set`
chains like `spawnProjectile`, `world.spawn(template)`, `flushCommands` batches,
`destroyEntity`, `loadJSON` — with no call-site migration, and the public
surface stays unchanged. Flecs merges a deferred entity's adds into a single
table move the same way. A bundle API can still be added later for other
reasons; it would not be needed for this cost.

### Design

State in `ArchetypeIndex`:

- `signatures: Map<EntityId, bigint>` keeps its meaning: the entity's
  **current** signature (what it holds now). `forEachStoreOf` keeps reading it.
- New `placed: Map<EntityId, bigint>`: only for entities touched since the
  last commit, the signature of the bucket that **currently contains** them
  (`0n` = in no bucket). An entity absent from `placed` is in the bucket of its
  `signatures` entry.

Operations:

- `addBit` / `removeBit`: compute `next`; if `next === prev`, return (value
  replace stays free, as today). Otherwise run the DEV iteration guard (moved
  here from `moveEntity`, same message), record `placed.set(id, prev)` **only
  if `id` is not already in `placed`**, then update `signatures` (delete the
  entry when `next === 0n`).
- `removeEntity(id)`: DEV guard as today; the bucket to leave is
  `placed.get(id)` when present, else `signatures.get(id)`; delete both
  entries and remove `id` from that bucket (if non-zero). No commit needed.
- New private `commit()`: if `placed.size === 0`, return. For each
  `[id, from]` in `placed`: `to = signatures.get(id) ?? 0n`; if `from !== to`,
  remove from `from`'s bucket (if non-zero) and add to `to`'s bucket (if
  non-zero), creating/deleting buckets and bumping `structuralVersion` exactly
  as `moveEntity` does today. Then `placed.clear()`. No DEV guard here: the
  guard fires at mutation time, and pending changes are always committed by
  `Query.resolve` before `beginIteration`.
- Commit points — every public read of bucket state calls `commit()` first:
  `version` getter (`:185`), `selectBuckets` (`:161`), `matching` (`:86`).
  `Query` only reaches buckets through `version` and `selectBuckets`
  (`src/query.ts:298-300`), so queries always see a committed index.
- `clear()` also clears `placed`.
- `moveEntity` is replaced by a private helper used by `commit` (rename to
  `placeIn(id, from, to)` or fold it into `commit`; implementer's choice).

`destroyEntity` needs no change: its row deletes call `removeBit`, which now
only edits `signatures`; the first one records the starting bucket in
`placed`; `removeEntity` then leaves that bucket once. Spawn paths need no
change either.

Edge cases and failure modes:

- **A → B → A inside one window** (add then remove the same component before
  any query): `from === to` at commit, so no move and no version bump. Today
  the entity is re-added at the end of its bucket's `Set`; after the change it
  keeps its position. Query order is unspecified, but check that no test or
  example relies on it.
- **Create then destroy before any read**: `placed` holds `0n`, `removeEntity`
  removes nothing and drops the entries.
- **Mutation during iteration in production** (DEV throws, unchanged): today
  the move is visible to the running loop immediately; after the change it is
  visible at the next read. Both are undefined behaviour, so no guarantee
  changes.
- **`loadJSON` / `clearAll`** clear the index first (`src/world.ts:154`, `:404`),
  then rebuild it through `set`/`add`; the rebuild becomes one commit at the
  first query.
- **`version` now has a side effect** (it commits). It is engine-internal and
  `Query` already reads it once per pass, so the cost lands where it is
  needed. Document it in the getter's JSDoc.

### Acceptance criteria

- A1. WHEN an entity is given N components and tags with no query read in
  between, THE SYSTEM SHALL insert it into a bucket at most once, and SHALL NOT
  create any bucket for an intermediate signature.
- A2. WHEN an entity joins an archetype another live entity already holds,
  THE SYSTEM SHALL leave `ArchetypeIndex.version` unchanged.
- A3. WHEN a live entity is destroyed, THE SYSTEM SHALL remove it from exactly
  one bucket, and IF its archetype still holds other entities THEN
  `version` SHALL stay unchanged.
- A4. WHEN `version`, `selectBuckets` or `matching` is read, or a `Query` is
  iterated, THE SYSTEM SHALL reflect every structural change made before the
  read.
- A5. WHILE a query iteration is in progress, IF a change alters an entity's
  signature or removes an entity, THEN in DEV THE SYSTEM SHALL throw the
  existing "Structural change during query iteration" error.
- A6. WHEN a component value is replaced (signature unchanged), THE SYSTEM
  SHALL record nothing pending.
- A7. The public API and every existing behaviour test stay unchanged; the
  randomized brute-force test (`src/archetype-cache.test.ts:52`) still passes.

## Part B: sprite culling in `isCulled`

### Today

`isCulled` (`src/modules/render-canvas2d/canvas2d-renderer.ts:194`) bounds
`rect` and `circle` and returns `false` for everything else, so every sprite is
drawn even when far off-screen. The README states this
(`src/modules/render-canvas2d/README.md:162`) and a test pins it
(`render-canvas2d.test.ts:1028`).

A sprite is drawn around its position: `drawEntity` translates to `(x, y)`,
then rotates and scales (`canvas2d-renderer.ts:255-262`); `drawShape` offsets by
`-dw/2, -dh/2` for the default `center` anchor or `0, 0` for `top-left`
(`:395-398`). Flips mirror around the anchor and keep the same world rect
(`:383-387`). `dw`/`dh` default to the atlas frame's `sw`/`sh` (`:376-377`).

### Design

- Resolve `dw`/`dh`: use `r.dw`/`r.dh`; when either is missing, read the frame
  from `atlases.getFrame(r.atlas, r.frame)`. With no atlases or no frame, return
  `false` (`drawShape` already skips the draw, so culling buys nothing).
- **No rotation and no scale** → exact AABB: `center` = `x ± dw/2, y ± dh/2`;
  `top-left` = `[x, x + dw] × [y, y + dh]`.
- **Rotation or scale present** → conservative circle around `(x, y)` that
  contains the sprite at any angle: `R = hypot(dw·|sx|, dh·|sy|)` × `½` for
  `center`, × `1` for `top-left` (the pivot is a corner, so the far corner is a
  full diagonal away). Over-drawing a few sprites at the edge is fine; a false
  cull is not.
- `isCulled` gains the entity's `rot` and `scale` as parameters. `drawPass`
  looks them up once per entity (only when they matter: world pass with a
  `viewRect`) and passes them to both `isCulled` and `drawEntity`, so drawn
  entities don't pay a second `Map` lookup. `drawEntity` takes the values
  instead of `rotStore` / `scaleStore`; `DrawEntry` carries them for the
  ordered path. All of these are module-private.
- `text` and `polygon` stay never-culled.

### Pre-existing bug found (scope decision pending)

`rect` and `circle` culling ignores rotation and scale: a rotated or scaled
rect, or a scaled circle, whose unrotated AABB is off-screen but whose drawn
shape reaches into view is wrongly culled. **B3 below fixes it with the same
bounds logic, if approved; otherwise it goes to `docs/backlog.md` as a
render-canvas2d item.**

### Acceptance criteria

- B1. WHEN a `view` is set and a sprite's bounds (as defined above) lie fully
  outside the view rect, THE SYSTEM SHALL not draw it, on both the unordered
  and the `RenderOrderDef` path.
- B2. WHEN any part of a sprite can be inside the view rect — including a
  rotated or scaled sprite whose unrotated AABB is outside — THE SYSTEM SHALL
  draw it.
- B3. (if approved) WHEN a `rect` or `circle` is rotated or scaled, THE SYSTEM
  SHALL cull it only by the same conservative rotation/scale-aware bounds.
- B4. WHEN `view` is absent, THE SYSTEM SHALL draw every sprite, as today.
- B5. `text` and `polygon` SHALL remain never-culled.

## Checklist

### Part A (core 3.11)

- [x] A-1 **Regression tests first** (must fail on today's code). In
      `src/archetype-index.test.ts`: (a) two entities given the same 10 bits one
      at a time — after the first is placed and `version` read, giving the
      second all 10 bits and reading `version` leaves it unchanged (A1, A2);
      (b) destroying one of them via `removeBit`×10 + `removeEntity` leaves
      `version` unchanged and the survivor still matches (A3); (c) A → B → A
      inside one window commits no move (A6 / edge case); (d) create then
      `removeEntity` before any read leaves no bucket. In `src/world.test.ts`
      or `src/archetype-cache.test.ts`: a `world.query` over a spawned entity
      sees it on the next pass, and a query rebuilt mid-batch still sees every
      change (A4). Run `npm test`; record which fail.
- [x] A-2 **Implement** the deferred commit in `src/archetype-index.ts` per the
      Design: `placed` map, `addBit`/`removeBit`/`removeEntity`/`clear`
      changes, private `commit()`, commit calls in `version`, `selectBuckets`,
      `matching`, DEV guard moved to mutation time (A5). Update the class and
      `version` JSDoc (the getter now commits). No change to `world.ts` or
      `query.ts` is expected; if one turns out to be needed, note why.
- [x] A-3 **DEV guard test**: an existing test should already cover the throw
      during iteration; confirm it still passes, add one for `removeBit` mid-loop
      if missing.
- [x] A-4 **Docs**: `src/query.md:35-45` (how buckets are re-selected) and any
      other guide sentence that implies one move per component — grep
      `src/*.md` for "bucket" and "archetype". Consumer docs describe, so no
      backlog or canon wording there.
- [x] A-5 **Measure** with a throwaway script (not committed): 1000 ×
      (`createEntity` + 10 `set`) then 1000 `destroyEntity`, 200 iterations,
      with one live query iterated per iteration; time before vs after. Report
      the numbers.
- [x] A-6 **Gate**: `npm run lint`, `npm run typecheck`, `npm test`,
      `npm run typecheck:examples`. No new failures versus the baseline.

### Part B (render-canvas2d sprite cull)

- [x] B-1 **Tests first** in `src/modules/render-canvas2d/render-canvas2d.test.ts`
      (the "camera view + cull" block, `:978`): replace
      `never culls text or sprite renderables` with a text-only test (B5) and
      add: off-screen centre-anchored sprite culled; top-left-anchored sprite
      culled by its own AABB; sprite overlapping the view edge drawn; rotated
      sprite whose unrotated AABB is just outside but whose rotated extent
      reaches in is drawn (B2); scaled sprite (`ScaleDef` 3×) near the edge
      drawn; `dw`/`dh` omitted → culled using the frame size; both unordered
      and `RenderOrderDef` paths (B1); no `view` → drawn (B4).
- [x] B-2 **Implement** in `canvas2d-renderer.ts` per the Design: sprite
      bounds in `isCulled`, rotation/scale passed in, single lookup in
      `drawPass`, `drawEntity` and `DrawEntry` take the values. Update
      `isCulled`'s JSDoc.
- [x] B-3 **(pending approval)** Apply the rotation/scale-aware bounds to
      `rect` and `circle`, with tests (rotated rect at the edge drawn; scaled
      circle at the edge drawn). If not approved: add a render-canvas2d backlog
      entry instead.
- [x] B-4 **Docs**: `src/modules/render-canvas2d/README.md:162` "Cull bounds"
      bullet — which kinds are culled and that rotated/scaled ones use a
      conservative bound.
- [x] B-5 **Gate**: same as A-6.

### Finishing

- [x] F-1 Delete the "Structural churn is expensive" row from the untriaged
      gaps table (`docs/backlog.md:343`); keep the template-clone half as core
      3.10 and drop 3.10's "see the game-of-life churn gap below" pointer
      (`docs/backlog.md:44-48`).
- [x] F-2 Add one `docs/decisions.md` entry: bucket placement is committed
      lazily at read time, not via a bundle/spawn API — why, and the bundle
      alternative.
- [x] F-3 Peer review (Sonnet, fresh context, read-only) against the acceptance
      criteria; fix blocking findings, at most 3 rounds.
- [x] F-4 Delete this plan in the final commit, naming its path in the message.
- [x] F-5 Hand-off note for SpaceShooter (not edited from this repo): its
      `docs/plans/perf-optimization.md` §D sprite-cull item can be ticked, and
      Pierre re-profiles at ~1000 spawns/tick to confirm `moveEntity` and
      `selectBuckets` dropped out of the top of the profile.
