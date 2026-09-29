# `@pierre/ecs/modules/drag-drop`

Drag-and-drop as a small state machine: press on something, follow the
pointer, find the drop target under it that accepts what is dragged, then drop
there or snap back. Cards onto piles, items into inventory slots, units onto
tiles.

`DragDrop` takes plain points and returns a result. It binds no input listener,
captures no pointer and draws nothing, so the same code serves a DOM UI and a
canvas board. Feed it from DOM events, from `modules/input`, or from a tick
system; draw the dragged item at `session.position`.

## Example

```ts
import { aabbContainsPoint } from '@pierre/ecs/modules/collision';
import { DragDrop } from '@pierre/ecs/modules/drag-drop';

interface Slot { h: number; items: string[]; w: number; x: number; y: number }

const slots: Slot[] = [
  { h: 64, items: ['sword'], w: 64, x: 0, y: 0 },
  { h: 64, items: [], w: 64, x: 80, y: 0 },
];

const drag = new DragDrop<{ from: Slot; item: string }, Slot>({
  accepts: slot => slot.items.length === 0,
  contains: (slot, point) => aabbContainsPoint(slot, point),
  targets: () => slots,
  threshold: 4,
});

// Press at (10, 12) on the sword, whose icon's top-left is the slot's.
drag.begin({ from: slots[0]!, item: 'sword' }, { x: 10, y: 12 }, { x: 0, y: 0 });
drag.move({ x: 95, y: 20 });
console.log(drag.session?.position); // { x: 85, y: 8 } — draw the icon here
console.log(drag.hovered === slots[1]); // true — highlight the empty slot

const drop = drag.end();
if (drop?.target) {
  drop.payload.from.items.splice(drop.payload.from.items.indexOf(drop.payload.item), 1);
  drop.target.items.push(drop.payload.item);
}
```

## API

```ts
class DragDrop<TPayload, TTarget> {
  constructor(options: DragDropOptions<TPayload, TTarget>);
  readonly session: DragSession<TPayload> | null;
  readonly hovered: TTarget | null;
  begin(payload: TPayload, pointer: Vec2, origin?: Vec2): void;
  move(pointer: Vec2): void;
  end(pointer?: Vec2): DropResult<TPayload, TTarget> | null;
  cancel(): void;
}

interface DragDropOptions<TPayload, TTarget> {
  targets: () => Iterable<TTarget>;                       // highest priority first
  contains: (target: TTarget, point: Vec2) => boolean;
  accepts: (target: TTarget, payload: TPayload) => boolean;
  probe?: DragProbe<TPayload>;                            // default 'pointer'
  threshold?: number;                                     // default 0
}

type DragProbe<TPayload> = 'origin' | 'pointer' | ((session: DragSession<TPayload>) => Vec2);

interface DragSession<TPayload> {
  readonly payload: TPayload;
  readonly grab: Vec2;      // pointer − origin at the press
  readonly press: Vec2;
  readonly pointer: Vec2;
  readonly position: Vec2;  // pointer − grab
  readonly started: boolean;
}

interface DropResult<TPayload, TTarget> {
  payload: TPayload;
  target: TTarget | null;   // null → snap back
}
```

## How a drop is decided

`end()` (and `hovered`, at any moment) walks `targets()` in order and returns
the first target that both **contains** the probe point and **accepts** the
payload. A target the pointer is over but that rejects the payload is skipped,
so a lower-priority target underneath can still take it. When none qualifies
the result's `target` is `null`: put the item back where it came from.

`targets()` is called on every lookup, so it can return a list built from the
current game state.

## Points and the grab offset

All points are in whatever space you hit-test in: client pixels for a DOM
layout (`event.clientX`), canvas pixels from `projectPointer`, or world units.
The session never converts.

Pass the dragged item's `origin` (its top-left, usually) to `begin`. The
session records where on the item it was grabbed, and `session.position` keeps
that offset, so the item does not jump to put its corner under the pointer.

## Probe

The probe is the point tested against the targets:

- `'pointer'` (default) — where the pointer is. Right for small items and
  "drop where I point".
- `'origin'` — the dragged item's origin, `session.position`.
- a function — any point derived from the session. Solitaire tests the
  dragged card's centre, so a card counts as over a pile when most of it is:

```ts
const probe = (s: DragSession<Card>): Vec2 =>
  ({ x: s.position.x + CARD_W / 2, y: s.position.y + CARD_H / 2 });
```

## Threshold

With `threshold > 0`, a press does not start a drag until the pointer has moved
that far. Releasing before then is a click: `end()` returns `null`, and
`hovered` stays `null`. This keeps a click or a double-click on a draggable item
from turning into a tiny drag.

## Not included

- **Input.** No listeners, no pointer capture. Call `begin` / `move` / `end`
  from your own handlers.
- **Drawing and lifting.** Keep the dragged item on top yourself — a drag layer
  in the DOM, a render-order bump on canvas — and draw it at
  `session.position`.
- **A snap-back animation.** Snap-back is whatever you do when `target` is
  `null`; tween the item home with `modules/tween` if you want it animated.
- **Several drags at once.** One session per `DragDrop`; multi-touch dragging is
  not supported.

## Dependencies

- `modules/math` — the `Vec2` type.
