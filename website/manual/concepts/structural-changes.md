# Structural changes

A **structural change** is a change to *which components or tags an entity has* —
adding one, removing one, or destroying the entity. Changing the *value* of a
component it already has is not structural.

The distinction matters because entities are grouped into archetype buckets by
signature, and a structural change is the thing that moves one between buckets.
It is the only place this engine makes you pay for a write, so it is worth
knowing what actually happens.

## What happens, in order

1. The entity's signature changes — a bit is set or cleared.
2. The entity leaves its old bucket and joins the bucket for the new signature.
3. If that signature has **never been seen before**, a new bucket is created, and
   that bumps the index's structural version.
4. A query's cached bucket list is only recomputed when that version has changed.

Step 3 is the load-bearing one. Moving an entity into a bucket that already
exists does **not** invalidate anything: the cached match still points at the
right bucket, which now happens to hold one more entity.

So the cost of a structural change is not "every query recomputes". It is:

- a small, constant move, when that combination already exists somewhere in the
  world; or
- a new bucket plus cache invalidation, the first time that combination appears.

Which means the pattern to avoid is **unbounded variety of component sets** — an
entity whose set of components grows differently from every other entity's, over
and over. The pattern to aim for is a small number of stable shapes.

## What is not structural

- Writing a new value into a component the entity already has. The signature is
  unchanged, and setting a bit that is already set is a no-op.
- Reading anything.
- Emitting an event.

## Destroy is deferred

`queueDestroy` does not remove the entity there and then. Destroys are flushed at
the end of the tick, together with queued events and lifecycle work, so a system
never sees the world change shape underneath it mid-tick.

That has a consequence worth remembering: **do not trust `store.size`, or any
count of live entities, in the middle of a tick.** If you need a budget or a cap,
either flush first and count, or keep an explicit counter of your own.

## Component sets and memory

Stores are per type, and each store keeps enough bookkeeping per entity to answer
"is this id here?". That bookkeeping is proportional to the ids actually in use,
not to the largest id you have ever allocated — so churning many short-lived
entities does not degrade lookup over time.

## Practical guidance

- **Batch spawns.** Spawning into an existing shape is cheap; the first entity of
  a new shape pays for the bucket.
- **Prefer tags over adding a component** when the extra thing carries no data.
  A tag is a bit on the signature like any other, so it is not free — but it
  avoids a whole second component store.
- **Do not add a component to mark one-off state.** If exactly one entity needs
  that component, that entity now has an archetype of its own, and it is the only
  member.
- **Flush-then-count** if a system needs a live count, rather than reading sizes
  mid-tick.

## See also

- [The model](../model/) — archetypes and signatures, explained.
- [`component-store`](../../core/component-store/) — stores, change ticks and
  serialization.
- [Ticks, frames and system order](../ticks-and-order/) — where the flush sits in
  the tick.
