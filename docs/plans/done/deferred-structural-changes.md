# Deferred Structural Changes — Command Buffer (core-engine roadmap 2.5)

Today only **destruction** can be deferred (`queueDestroy` → `flushDestroys`).
Adding/removing a component mid-iteration, or spawning inside a query loop, has
no safe path: `ColumnStore.delete` swap-removes (moves the last slot into the
freed one), so mutating a store during its own query iteration silently skips or
double-visits entities. Canon: Bevy `Commands`, Unity DOTS `EntityCommandBuffer`,
Flecs deferred operations.

Two deliverables:

1. An **ordered** deferred command buffer covering create / destroy /
   add-component / remove-component / add-tag / remove-tag, applied in insertion
   order at the tick flush.
2. A **DEV-only iteration guard** that throws when a store is mutated while a
   query iteration over the world is active.

## Design decisions to confirm

### A. Surface shape — world queue-methods (recommended) vs CommandBuffer object

**Recommended (world methods, extends the `queueDestroy` precedent):**

```ts
world.queueSpawn(template?, overrides?): EntityId // reserves id now, applies at flush
world.queueDestroy(id)                            // exists; now ordered
world.queueAdd(def, id, value)
world.queueRemove(def, id)
world.queueAddTag(def, id)
world.queueRemoveTag(def, id)
```

All record into one ordered `commandQueue`, drained at the existing flush point.
Rationale: matches the shipped `queueDestroy`/`flushDestroys` pattern and the
consumer's def→store idiom; nothing new to thread through the system context.

**Alternative (Bevy-style object):** `world.commands()` returns a `CommandBuffer`
recorded into and `apply()`-d at flush. More faithful to Bevy, but this engine's
systems receive a consumer-defined `ctx`, not an injected `Commands`, so a
world-owned buffer applied at flush is the natural fit either way.

### B. Drain point / naming

`TickRunner` calls `world.flushDestroys()`. Options:
- **Recommended:** add `world.flushCommands()` that drains the ordered queue
  (destroys included), make `flushDestroys()` delegate to it for back-compat,
  and point `TickRunner` at `flushCommands()`. Deferred structural work then
  applies in the same tick slot destroys already do.
- Keep two separate queues/flush calls (more surface, more ordering to reason
  about).

### C. Deferred spawn id reservation

`queueSpawn` reserves the id synchronously (`nextId++`, mark alive now) so the
caller can immediately `queueAdd(def, id, …)` against it; the component/tag
application and the `EntityCreated` emit happen at flush, in order.

### D. Ordering & dedup

- Commands apply in strict insertion order (a create → add → destroy sequence
  is honored).
- `queueDestroy` keeps its idempotency: a repeated destroy of the same id does
  not double-emit `EntityDestroyed` (dedup destroys within the queue, or make
  `destroyEntity` a no-op on an already-dead id).

### E. DEV iteration guard

`QueryBuilder[Symbol.iterator]` (world path) marks an "iteration active" flag on
the world/index; `store.set`/`store.delete` assert the flag is clear in DEV and
throw a descriptive error naming the deferred alternative. Zero cost in prod
(`import.meta.env.DEV`).

## Checklist

- [x] Ordered command queue + `queueSpawn` / `queueAdd` / `queueRemove` / `queueAddTag` / `queueRemoveTag`
- [x] `flushCommands` drain point; `flushDestroys` delegates; `TickRunner` updated
- [x] Deferred spawn id reservation + ordered application with correct lifecycle emits
- [x] DEV-only mutation-under-iteration guard
- [x] Tests: ordering, spawn-in-loop, add/remove-in-loop, destroy dedup, guard fires in DEV
- [x] Docs: `world.md` (+ `tick.md` / `query.md` as needed)
- [x] `npm run docs:api` regenerated; drift green
- [x] tsc + lint + full suite green
- [x] peer review clean
