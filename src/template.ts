/** Blueprint for spawning an entity: declares which components and tags to attach. */
export interface EntityTemplate {
  readonly name: string;
  /** Component name → serialized value pairs to attach on spawn. */
  readonly components?: Readonly<Record<string, unknown>>;
  /** Tag names to attach on spawn. */
  readonly tags?: readonly string[];
}
