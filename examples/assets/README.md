# Shared example assets

Third-party asset packs (Kenney, etc.) shared across the `examples/*`
prototypes, so the same spritesheet / tilemap files are stored **once**
instead of being copied into every example that uses them.

## Layout

One folder per pack, named after the pack as downloaded:

```
examples/assets/
  kenney_roguelike-rpg-pack/
    Spritesheet/...
    Map/...
    License.txt
  <next-pack>/
```

Keep each pack's original `License.txt` next to its files.

## Using a pack from an example

Import the file with Vite's `?url` suffix; the path is relative to the
example's `src/`:

```ts
import sheetUrl from '../../assets/kenney_roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png?url';
```

`?url` makes Vite fingerprint and emit the file into the example's own
`dist/`, so each example still ships a self-contained bundle — only the
**source** is shared. No `vite.config.ts` change is needed: the dev
server already serves the repo root (examples consume `@pierre/ecs` via
`file:../..`), so `../../assets/...` is within the allowed fs roots.

## Licensing

These packs are redistributed under their own licenses (the Kenney packs
are CC0). See each pack's `License.txt`.
