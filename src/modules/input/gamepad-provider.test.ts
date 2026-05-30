import type { InputRawEvent } from '#input-source';
import type { GamepadSnapshot } from './gamepad-provider';

import { describe, expect, it } from 'vitest';

import { Gamepad, GamepadProvider } from './gamepad-provider';
import { createInput } from './input-state';

function pad(
  buttons: readonly number[],
  axes: readonly number[] = [0, 0, 0, 0],
): GamepadSnapshot {
  return {
    axes,
    buttons: buttons.map(value => ({ pressed: value >= 0.5, value })),
    connected: true,
  };
}

describe('gamepadProvider', () => {
  it('emits a down edge once per button press and an up edge on release', () => {
    let snapshot: GamepadSnapshot | null = pad([0]);
    const provider = new GamepadProvider({ source: () => [snapshot] });
    const events: InputRawEvent[] = [];
    provider.subscribe(e => events.push(e));

    provider.poll();
    expect(events).toEqual([]);

    snapshot = pad([1]);
    provider.poll();
    provider.poll(); // held — no repeat
    expect(events).toEqual([{ code: Gamepad.A, kind: 'down' }]);

    snapshot = pad([0]);
    provider.poll();
    expect(events).toEqual([
      { code: Gamepad.A, kind: 'down' },
      { code: Gamepad.A, kind: 'up' },
    ]);
  });

  it('maps the standard button indices to named codes', () => {
    const buttons = Array.from({ length: 17 }).fill(0);
    buttons[9] = 1; // Start
    buttons[12] = 1; // DpadUp
    const provider = new GamepadProvider({ source: () => [pad(buttons)] });
    const codes: string[] = [];
    provider.subscribe(e => codes.push(e.code));

    provider.poll();
    expect(codes).toContain(Gamepad.Start);
    expect(codes).toContain(Gamepad.DpadUp);
  });

  it('converts deadzoned stick axes into digital directions', () => {
    let axes = [0, 0, 0, 0];
    const provider = new GamepadProvider({ deadzone: 0.4, source: () => [pad([], axes)] });
    const codes: string[] = [];
    provider.subscribe(e => codes.push(e.code));

    axes = [0.2, -0.9, 0, 0]; // X within deadzone, Y past it (up)
    provider.poll();
    expect(codes).toEqual([Gamepad.LeftStickUp]);
  });

  it('feeds an action map through createInput', () => {
    let snapshot: GamepadSnapshot | null = pad([0]);
    const provider = new GamepadProvider({ source: () => [snapshot] });
    const input = createInput({ confirm: [Gamepad.A] }, [provider]);

    snapshot = pad([1]);
    provider.poll();
    expect(input.justPressed('confirm')).toBe(true);
    expect(input.isDown('confirm')).toBe(true);

    input.clearEdges();
    expect(input.justPressed('confirm')).toBe(false);
    expect(input.isDown('confirm')).toBe(true);
  });

  it('unions state across multiple connected pads', () => {
    const provider = new GamepadProvider({
      source: () => [pad([1]), pad([0, 1])],
    });
    const codes: string[] = [];
    provider.subscribe(e => codes.push(e.code));

    provider.poll();
    expect(codes).toContain(Gamepad.A);
    expect(codes).toContain(Gamepad.B);
  });

  it('releases held buttons when the pad disconnects', () => {
    let snapshot: GamepadSnapshot | null = pad([1]);
    const provider = new GamepadProvider({ source: () => [snapshot] });
    const events: InputRawEvent[] = [];
    provider.subscribe(e => events.push(e));

    provider.poll();
    expect(events).toEqual([{ code: Gamepad.A, kind: 'down' }]);

    snapshot = null; // navigator.getGamepads() returns null slots for unplugged pads
    provider.poll();
    expect(events).toEqual([
      { code: Gamepad.A, kind: 'down' },
      { code: Gamepad.A, kind: 'up' },
    ]);
  });

  it('treats an analog trigger past the threshold as pressed', () => {
    const buttons = Array.from({ length: 8 }, () => ({ pressed: false, value: 0 }));
    buttons[7] = { pressed: false, value: 0.6 }; // RightTrigger, not flagged pressed
    const snapshot: GamepadSnapshot = { axes: [0, 0, 0, 0], buttons, connected: true };
    const provider = new GamepadProvider({ buttonThreshold: 0.5, source: () => [snapshot] });
    const codes: string[] = [];
    provider.subscribe(e => codes.push(e.code));

    provider.poll();
    expect(codes).toContain(Gamepad.RightTrigger);
  });
});
