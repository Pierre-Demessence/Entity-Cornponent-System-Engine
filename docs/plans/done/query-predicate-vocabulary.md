# Query Predicate Vocabulary (core-engine roadmap 1.4)

Extend the query surface so consumers can express three everyday patterns that
are inexpressible today, plus any-of groups. Canon: Bevy `With` / `Without` /
`Option<&T>` / `Or`, Unity DOTS `WithNone` / `WithAny`, Flecs `not` / `optional`
/ `or`.

The shipped query engine has **zero call sites** in `examples/**` and
`src/modules/**`, so there is no consumer to migrate and the surface is free to
settle now.

## Capabilities

1. **Tag-only queries** — iterate entities by tag alone, yielding `[EntityId]`.
   `world.query().withTag(enemyTag)`.
2. **Component-level exclusion** — exclude entities holding a *component*
   (Bevy `Without<T>`), not just a tag. `.withoutComponent(store)`.
3. **Optional components** — yield a companion component that may be absent
   (Bevy `Option<&T>`); widens the result tuple with `O | undefined`.
   `.optional(store)`.
4. **Any-of groups** — match entities holding at least one member of a group
   (Bevy `Or`, DOTS `WithAny`). `.anyOf(a, b)`; each call is one group, groups
   AND together. Members may be component stores or tag stores.
5. **With-component filter** — require a component without yielding it
   (Bevy `With<T>`). `.withComponent(store)`. Falls out of the same machinery.

## Design

- `QueryBuilder` fluent methods operate on **store instances**
  (`ComponentStoreLike` / `TagStore`), consistent with the existing
  `.withTag` / `.without`. World users resolve defs with `world.getStore(def)` /
  `world.getTag(def)`. No resolver plumbing in the builder.
- `.optional<O>(store)` returns `QueryBuilder<[...T, O | undefined]>` — the only
  method that widens the tuple type; the rest return `this`.
- `world.query()` gains a zero-arg overload returning `QueryBuilder<[]>` for the
  tag-only / filter-only entry point.
- `ArchetypeIndex.matching(required, excluded, anyOf)` gains an `anyOf: bigint[]`
  parameter: a bucket matches when its signature is a superset of `required`,
  disjoint from `excluded`, and intersects **every** any-of mask. The match
  cache key includes the any-of masks.
- Both query paths (indexed bucket-select and standalone smallest-store scan)
  yield identical results. Scan iteration source is the smallest mandatory set
  (data stores ∪ with-components ∪ required tags); with no mandatory set it
  falls back to the union of the smallest any-of group.

## Checklist

- [x] `ArchetypeIndex.matching` / `selectBuckets` accept any-of masks; cache key updated
- [x] `ArchetypeIndex` tests for any-of matching
- [x] `QueryBuilder`: `withComponent`, `withoutComponent`, `optional`, `anyOf`; tag-only iteration
- [x] `QueryBuilder` index + scan paths handle all new terms, identical results
- [x] `world.query()` zero-arg overload
- [x] `QueryBuilder` tests: tag-only, component exclusion, optional, any-of, with-component (both paths)
- [x] `query.md` documents the new surface
- [x] `npm run docs:api` / `docs:usage` regenerated if surface changed; drift tests green
- [x] tsc + lint + full test suite green
- [x] peer review clean
