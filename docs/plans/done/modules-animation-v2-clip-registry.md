# modules/animation V2 — sprite clip registry

Close the `modules/animation` V2 "clip registry" backlog entry (ready): named
animation clips shared across entities, looked up by key, with per-entity
playback state and control. Canon: Unity `AnimationClip` + `Animator`, Godot
`SpriteFrames` named animations, Phaser `anims.create({ key, … })` +
`sprite.play(key)`, Bevy `AnimationClip`.

V1's `SpriteAnimation` embeds the frame list in every component — a slice of the
canonical surface where a clip is a *shared resource selected by key*. V2 **adds**
the registry form alongside V1; V1 stays for one-off / procedural animations.

## Decisions (settled before building)

- **V1 stays; V2 is additive.** `SpriteAnimation`/`SpriteAnimationDef` and their
  system are unchanged (they have consumers and suit inline/procedural clips).
  The registry form is for clips shared across many entities.
- **Shared frame-stepping logic is extracted, not duplicated.** A private
  `stepFrameCursor(cursor, frameCount, fps, loop, dtMs)` mutates a
  `{ currentIndex, elapsedMs }` cursor; both `tickSpriteAnimation` (V1) and the
  new `tickSpriteAnimator` (V2) call it, so their advance/loop/latch behaviour
  can never diverge. V1's observable behaviour is unchanged.
- **`SpriteClip` is an immutable shared resource**:
  `{ frames: readonly string[]; fps: number; loop: boolean }`. It carries no
  playback state — that lives on the per-entity animator.
- **`SpriteClipRegistry` is a validated map**, injected into the system like the
  audio `provider`: `register(name, clip)` (throws on empty name, non-positive
  fps, or duplicate key), `get`, `has`, `require` (throws on miss).
- **`SpriteAnimator` holds only playback state**:
  `{ clip: string; currentIndex: number; elapsedMs: number; playing: boolean }`.
  `playClip(animator, clip, restart?)` switches clip and resets the cursor;
  pausing is `animator.playing = false` (documented, no ceremony helper).
- **Unknown clips are skipped, optionally reported.** The system looks the clip
  up per tick; a missing key skips the entity (no frame write) and calls an
  optional `onMissingClip(entityId, clip)` — a runtime typo backstop, since the
  animator's `clip` can be set to any key at play time.
- **The system writes `renderable.frame`** exactly like V1's, preserving all
  other `Renderable` fields; entities without a renderable still advance.

## Probable API

```ts
interface SpriteClip { frames: readonly string[]; fps: number; loop: boolean }
class SpriteClipRegistry {
  register(name: string, clip: SpriteClip): this;
  get(name: string): SpriteClip | undefined;
  has(name: string): boolean;
  require(name: string): SpriteClip;
}
interface SpriteAnimator { clip: string; currentIndex: number; elapsedMs: number; playing: boolean }
const SpriteAnimatorDef: ComponentDef<SpriteAnimator>;
function makeSpriteAnimator(clip: string, playing?: boolean): SpriteAnimator;
function playClip(animator: SpriteAnimator, clip: string, restart?: boolean): void;
function tickSpriteAnimator(animator: SpriteAnimator, clip: SpriteClip, dtMs: number): void;
function currentAnimatorFrame(animator: SpriteAnimator, clip: SpriteClip): string;
function makeSpriteClipAnimationSystem<TCtx>(options: {
  registry: SpriteClipRegistry;
  animatorDef?: ComponentDef<SpriteAnimator>;
  onMissingClip?: (entityId: EntityId, clip: string) => void;
  name?: string;
  runAfter?: string[];
}): SchedulableSystem<TCtx>;
```

## Checklist

- [x] Extract private `stepFrameCursor`; route V1 `tickSpriteAnimation` through
      it (behaviour unchanged).
- [x] Add `SpriteClip`, `SpriteClipRegistry` (register/get/has/require + validation).
- [x] Add `SpriteAnimator` + `SpriteAnimatorDef` (+ deserialize validation),
      `makeSpriteAnimator`, `playClip`, `tickSpriteAnimator`,
      `currentAnimatorFrame`.
- [x] Add `makeSpriteClipAnimationSystem` (registry lookup, skip+`onMissingClip`
      on miss, write `renderable.frame`).
- [x] Put the new code in a colocated file `sprite-clip.ts` (keep
      `sprite-animation.ts` V1-only) and export from `index.ts`.
- [x] Colocated tests `sprite-clip.test.ts`: registry register/dup/require/miss;
      animator round-trip + validation; `playClip` reset & no-op-when-same;
      `tickSpriteAnimator` advance/loop/latch + paused = no advance; system writes
      the frame, skips unknown clips + fires `onMissingClip`, skips renderable-less
      entities.
- [x] `README.md` — clip-registry section; update the "Design notes" V2 paragraph
      (it currently points at this backlog entry).
- [x] `docs/roadmap/ecs-module-backlog.md` — drop the clip-registry V2 entry + its
      status-table row.
- [x] `npm run docs:api`.
- [x] `npm run lint` + `npm test`.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.

## Shape notes

- No example migration: no current example shares clips across entities; adoption
  is a consumer's own change. The 2D-rig + `TweenDef` component V2 slice stays a
  separate deferred entry, untouched.
- No core change; the whole feature lives in the module.
