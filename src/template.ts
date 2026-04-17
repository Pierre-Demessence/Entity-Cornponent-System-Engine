/** Blueprint for spawning an entity: declares which components and tags to attach. */
export interface EntityTemplate {
  readonly name: string;
  /** Component name → serialized value pairs to attach on spawn. */
  readonly components?: Readonly<Record<string, unknown>>;
  /** Tag names to attach on spawn. */
  readonly tags?: readonly string[];
}

/**
 * Compose multiple templates into one. Later templates override earlier ones:
 *
 * - `name` is taken from the **last** template (so extending a base and
 *   renaming produces a sensibly-named descendant).
 * - `components` are shallow-merged by component name — later wins, earlier is
 *   kept when a later template does not redeclare that component. No deep
 *   merge: if two templates both declare `"fighter"`, the later value replaces
 *   the earlier one wholesale.
 * - `tags` are **unioned** across all inputs (insertion order, de-duplicated).
 *
 * Passing zero templates throws — an anonymous empty template is never what a
 * caller wants. Passing one template returns a new object equivalent to the
 * input.
 */
export function composeTemplates(
  ...templates: readonly EntityTemplate[]
): EntityTemplate {
  if (templates.length === 0) {
    throw new Error('composeTemplates requires at least one template');
  }
  const components: Record<string, unknown> = {};
  const tagSet = new Set<string>();
  for (const t of templates) {
    if (t.components)
      Object.assign(components, t.components);
    if (t.tags) {
      for (const tag of t.tags) tagSet.add(tag);
    }
  }
  const last = templates.at(-1)!;
  const result: EntityTemplate = {
    name: last.name,
    ...(Object.keys(components).length > 0 ? { components } : {}),
    ...(tagSet.size > 0 ? { tags: [...tagSet] } : {}),
  };
  return result;
}
