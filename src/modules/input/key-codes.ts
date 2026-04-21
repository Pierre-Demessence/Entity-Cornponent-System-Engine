/**
 * Frozen record of common `KeyboardEvent.code` values, organised by
 * category. Use `Key.ArrowLeft` instead of `'ArrowLeft'` in
 * `createInput(...)` maps to get compile-time typo protection and IDE
 * autocomplete:
 *
 * ```ts
 * import { createInput, Key } from '@pierre/ecs/modules/input';
 *
 * createInput({
 *   jump:  [Key.Space, Key.ArrowUp, Key.KeyW],
 *   left:  [Key.ArrowLeft, Key.KeyA],
 *   right: [Key.ArrowRight, Key.KeyD],
 * }, [new KeyboardProvider()]);
 * ```
 *
 * `.code` values are physical-position-based (US-QWERTY labelled), so
 * `Key.KeyW` fires for the key at the physical top-left letter position
 * on AZERTY, QWERTZ, Dvorak, Colemak, etc. This gives "WASD" ergonomics
 * on every layout.
 *
 * Passing raw strings still works — this const is purely an ergonomics
 * layer for the keyboard provider. Custom providers (gamepad, touch,
 * test harnesses) are free to emit any string codes.
 */
export const Key = {
  // Modifiers
  AltLeft: 'AltLeft',
  AltRight: 'AltRight',
  // Arrows
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',

  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  // Punctuation (US-QWERTY)
  Backquote: 'Backquote',
  Backslash: 'Backslash',
  // Whitespace / editing
  Backspace: 'Backspace',
  BracketLeft: 'BracketLeft',

  BracketRight: 'BracketRight',
  Comma: 'Comma',
  ControlLeft: 'ControlLeft',
  ControlRight: 'ControlRight',
  Delete: 'Delete',
  // Digit row
  Digit0: 'Digit0',
  Digit1: 'Digit1',
  Digit2: 'Digit2',

  Digit3: 'Digit3',
  Digit4: 'Digit4',
  Digit5: 'Digit5',
  Digit6: 'Digit6',
  Digit7: 'Digit7',
  Digit8: 'Digit8',
  Digit9: 'Digit9',
  Enter: 'Enter',
  Equal: 'Equal',
  Escape: 'Escape',
  // Function row
  F1: 'F1',
  F2: 'F2',
  F3: 'F3',
  F4: 'F4',
  F5: 'F5',
  F6: 'F6',
  F7: 'F7',
  F8: 'F8',
  F9: 'F9',
  F10: 'F10',
  F11: 'F11',
  F12: 'F12',
  // Letters (physical US-QWERTY positions)
  KeyA: 'KeyA',
  KeyB: 'KeyB',
  KeyC: 'KeyC',
  KeyD: 'KeyD',

  KeyE: 'KeyE',
  KeyF: 'KeyF',
  KeyG: 'KeyG',
  KeyH: 'KeyH',
  KeyI: 'KeyI',
  KeyJ: 'KeyJ',
  KeyK: 'KeyK',
  KeyL: 'KeyL',
  KeyM: 'KeyM',
  KeyN: 'KeyN',

  KeyO: 'KeyO',
  KeyP: 'KeyP',
  KeyQ: 'KeyQ',
  KeyR: 'KeyR',
  KeyS: 'KeyS',
  KeyT: 'KeyT',
  KeyU: 'KeyU',
  KeyV: 'KeyV',
  KeyW: 'KeyW',
  KeyX: 'KeyX',
  KeyY: 'KeyY',
  KeyZ: 'KeyZ',

  MetaLeft: 'MetaLeft',
  MetaRight: 'MetaRight',
  Minus: 'Minus',
  // Numpad
  Numpad0: 'Numpad0',
  Numpad1: 'Numpad1',
  Numpad2: 'Numpad2',
  Numpad3: 'Numpad3',
  Numpad4: 'Numpad4',
  Numpad5: 'Numpad5',
  Numpad6: 'Numpad6',
  Numpad7: 'Numpad7',

  Numpad8: 'Numpad8',
  Numpad9: 'Numpad9',
  NumpadAdd: 'NumpadAdd',
  NumpadDecimal: 'NumpadDecimal',
  NumpadDivide: 'NumpadDivide',
  NumpadEnter: 'NumpadEnter',
  NumpadMultiply: 'NumpadMultiply',
  NumpadSubtract: 'NumpadSubtract',
  Period: 'Period',
  Quote: 'Quote',
  Semicolon: 'Semicolon',
  ShiftLeft: 'ShiftLeft',
  ShiftRight: 'ShiftRight',
  Slash: 'Slash',
  Space: 'Space',
  Tab: 'Tab',
} as const;

/**
 * String-literal union of every value in the `Key` record. Use this to
 * constrain map values when you want compile-time enforcement that
 * every code is a known keyboard code:
 *
 * ```ts
 * const codes: readonly KeyboardCode[] = [Key.ArrowLeft, Key.KeyA];
 * // or: [Key.ArrowLeft, Key.KeyA] satisfies readonly KeyboardCode[];
 * ```
 */
export type KeyboardCode = typeof Key[keyof typeof Key];
