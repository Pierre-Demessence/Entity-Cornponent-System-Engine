type JsonObject = Record<string, unknown>;

/** Narrow `value` to a plain object or throw with a descriptive `label`-prefixed message. */
export function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as JsonObject;
}

/** Narrow `value` to an array or throw with a descriptive `label`-prefixed message. */
export function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array.`);
  }

  return value;
}

/** Narrow `value` to a finite number or throw with a descriptive `label`-prefixed message. */
export function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }

  return value;
}

/** Narrow `value` to a string or throw with a descriptive `label`-prefixed message. */
export function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string.`);
  }

  return value;
}

/** Narrow `value` to a boolean or throw with a descriptive `label`-prefixed message. */
export function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean.`);
  }

  return value;
}
