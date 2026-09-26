# modules/audio V2 — spatial listener (2D-first)

Close the `modules/audio` V2 "spatial listener" backlog entry (ready): a
listener position on the world and per-source **distance attenuation** + **stereo
pan**, applied every tick to active playbacks without restarting them. Canon:
Unity `AudioSource`/`AudioListener`, Godot `AudioStreamPlayer2D` + `max_distance`,
Web Audio `PannerNode` inverse-distance model.

Distance attenuation is dimension-agnostic (Euclidean distance), so positions are
stored as vectors and 3D distance already works. **Stereo pan is the 2D choice.**
Full 3D HRTF panning (`PannerNode`) and occlusion (raycast + lowpass) are each
split out as their own separate deferred backlog entries — out of scope here.

## Decisions (settled before building)

- **Core `AudioProvider` gains two required methods** (`src/audio-provider.ts`):
  `setPlaybackVolume(handle, value)` and `setPlaybackPan(handle, value)`. The
  existing interface can only `play` / `stop` / `setVolume(channel)`, so there is
  no way to retune an *active* voice as the listener/source move. Both are
  required (pre-1.0; only `WebAudioProvider` and one test fake implement the
  interface — both migrate in this commit). Unknown handles no-op, like `stop`.
- **`WebAudioProvider` inserts a `StereoPannerNode` per voice.** Routing becomes
  `source → voiceGain → panner → channelGain`. `setPlaybackVolume` writes
  `voiceGain.gain.value` (clamped `[0,1]`); `setPlaybackPan` writes
  `panner.pan.value` (clamped `[-1,1]`).
- **Spatial config is a nested `spatial` object on `AudioSource`**, atomic so a
  source is positioned or not (no "both-or-neither" flat-field trap):
  `spatial?: { x; y; refDistance?; maxDistance?; rolloff? }`. Per-source falloff
  overrides the system defaults.
- **The listener is supplied by the consumer**, not read from a transform module
  — same ECS-decoupling as steering taking plain `Vec2`. `makeAudioSystem`
  options gain `getListener?: (ctx) => AudioListener | undefined` where
  `AudioListener = { x; y }`, plus `spatialDefaults?: { refDistance; maxDistance;
  rolloff }` (Web Audio canon defaults `1 / 10000 / 1`).
- **Spatial params stay out of the restart signature.** The signature keeps
  `clipId / channel / loop / baseVolume`; distance/pan are applied via the new
  provider methods after `play`, every tick, on the current handle — so a moving
  source never retriggers.
- **Inverse-distance falloff, Web Audio model.** `d = clamp(distance, ref, max)`;
  `atten = ref / (ref + rolloff * (d − ref))` (∈ `(0, 1]`); effective volume =
  `baseVolume × atten`. **Pan** = `clamp((source.x − listener.x) / max, −1, 1)` —
  saturates at `maxDistance`; documented as the V1 pan model.
- **3D HRTF and occlusion each become a new deferred backlog entry**, not silent
  omissions.

## Probable API

```ts
// core
interface AudioProvider {
  // …existing…
  setPlaybackVolume: (handle: AudioHandle, value: number) => void;
  setPlaybackPan: (handle: AudioHandle, value: number) => void;
}

// module
interface AudioSpatial { x: number; y: number; refDistance?: number; maxDistance?: number; rolloff?: number }
interface AudioSource { /* …existing… */ spatial?: AudioSpatial }
interface AudioListener { x: number; y: number }
interface AudioSystemOptions {
  /* …existing… */
  getListener?: (ctx: TCtx) => AudioListener | undefined;
  spatialDefaults?: { refDistance?: number; maxDistance?: number; rolloff?: number };
}
```

## Checklist

- [x] Core: add `setPlaybackVolume` / `setPlaybackPan` to `AudioProvider`
      (`src/audio-provider.ts`).
- [x] `WebAudioProvider`: `StereoPannerNode` per voice + implement both methods
      (clamp, unknown-handle no-op).
- [x] `AudioSource`: nested `spatial` field + `AudioSpatial`, with deserialize
      validation (finite `x`/`y`; `refDistance > 0`; `maxDistance ≥ refDistance`;
      `rolloff ≥ 0`) and serialize round-trip.
- [x] `audio-system`: `AudioListener`, `getListener` + `spatialDefaults` options,
      per-tick attenuation + pan applied to the active handle; spatial params kept
      out of the signature.
- [x] Exports in `src/modules/audio/index.ts` (`AudioSpatial`, `AudioListener`).
- [x] Tests:
      - source: round-trips `spatial`; rejects bad `refDistance`/`maxDistance`/
        `rolloff`/non-finite `x`/`y`.
      - provider: `setPlaybackVolume`/`setPlaybackPan` write the nodes; unknown
        handle no-ops (extend the fake `AudioContext` with `createStereoPanner`).
      - system: spatial source + listener → correct `setPlaybackVolume`/
        `setPlaybackPan` values; farther → quieter; `dx > 0` → pan right; no
        listener / non-spatial → no spatial calls; a moving source does **not**
        restart (`play` called once).
- [x] `src/modules/audio/README.md` — spatial section, listener wiring, the pan
      model note.
- [x] `docs/roadmap/ecs-module-backlog.md` — drop the spatial-listener V2 entry +
      status row; add deferred entries for **3D HRTF panning** and **audio
      occlusion**.
- [x] `npm run docs:api`.
- [x] `npm run lint` + `npm test`.
- [x] Peer review (subagent, no edits, no `vscode_askQuestions`), fix findings,
      re-review until LGTM.

## Shape notes

- No example migration: no current example places positioned sources. Adoption is
  a consumer's own playtest-owned change. The existing one-shot `AudioQueue` path
  is unchanged and non-spatial.
- Cross-cutting: this is the one core-touching change of the recent module builds
  — the provider interface gains two methods. Every implementer (real + fake)
  migrates in the same commit.
