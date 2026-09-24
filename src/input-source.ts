/**
 * Raw input event emitted by an `InputProvider`: a `down`/`up` edge keyed by a
 * provider-defined string `code` (for keyboards, `KeyboardEvent.code` by
 * default — see `KeyboardProviderOptions.emit`). Translation from `code` to
 * action is the responsibility of `createInput` / `createEventInput`.
 */
export type InputRawEvent
  = | { kind: 'down'; code: string }
    | { kind: 'up'; code: string };

/**
 * Low-level "where do raw input events come from" contract. Core ships the
 * interface; implementations live in `@pierre/ecs/modules/input` (keyboard,
 * pointer, gamepad) or in consumer code (touch extensions, a synthetic test
 * harness).
 */
export interface InputProvider {
  dispose: () => void;
  subscribe: (handler: (raw: InputRawEvent) => void) => () => void;
}
