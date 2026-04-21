# Entity Templates

## EntityTemplate

Defined in `packages/ecs/src/template.ts`. Engine-agnostic — no knowledge of
specific component types.

```ts
interface EntityTemplate {
  readonly name: string;
  readonly components?: Readonly<Record<string, unknown>>;
  readonly tags?: readonly string[];
}
```

- **name** — Human-readable identifier (e.g. `"orc"`, `"healPotion"`)
- **components** — Keys are registered `ComponentDef` names,
  values are component data
- **tags** — Registered `TagDef` names to add to the entity

## World.spawn()

```ts
world.spawn(template: EntityTemplate, overrides?: Record<string, unknown>): EntityId
```

1. Creates a new entity via `world.createEntity()`
2. Iterates `template.components` — resolves each store by name
   via `storeByName`, shallow-merges with matching override, calls
   `store.set()`
3. Iterates `template.tags` — resolves each tag store via `tagByName`,
   calls `store.add()`
4. Throws if a component or tag name is not registered

### Overrides

Pass runtime data (e.g. position) that varies per spawn call:

```ts
world.spawn(orcTemplate, { positions: { x: 5, y: 10 } });
```

Override values are spread over the template's component data,
so partial overrides work.

### Caveats

- **Shallow merge only** — Nested structures cannot be partially
  overridden. Overriding a single field inside `equipments` requires
  passing the entire `equipments` object.
- **Runtime validation** — Component/tag name typos (e.g. `renderable`
  vs `renderables`) are caught at spawn time, not compile time. This
  is a trade-off for dynamic registration.
- **Template names** — Must be unique within each template array.
  Duplicate names cause `find()` to return the first match silently.

## composeTemplates()

```ts
composeTemplates(...templates: readonly EntityTemplate[]): EntityTemplate
```

Combines multiple templates into one so content layers (race + class +
archetype + variant) can be expressed as plain data without ad-hoc
builders.

- **`name`** — taken from the **last** template.
- **`components`** — shallow-merged by component name; later inputs win
  for any component they redeclare. Nested values are replaced
  wholesale (no deep merge).
- **`tags`** — unioned across all inputs, de-duplicated, preserving
  first-seen order.
- Throws if called with zero templates; never mutates its inputs.

```ts
const orc = composeTemplates(baseCreature, orcRace, meleeArchetype, {
  name: 'orcChieftain',
  components: { fighter: { hp: 30, attack: 6 } },
  tags: ['elite'],
});
world.spawn(orc, { positions: { x: 5, y: 10 } });
```


## See also

- [Component Store](component-store.md) - where template components land.
- [EcsWorld](world.md) - `world.spawn(template, overrides)` is the consumer entry point.

