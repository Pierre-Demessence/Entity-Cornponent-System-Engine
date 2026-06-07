# modules/tmx V2 — Multiple Tilesets + Object Layers + Properties + gzip

Plan for expanding `modules/tmx` to cover the high-priority missing TMX features.

## Scope

| Feature | What changes |
|---------|-------------|
| **Multiple tilesets** | `TmxMap.tileset` → `tilesets: TmxTileset[]`. `resolveGid(gid)` helper to find which tileset owns a GID. |
| **Object layers** | New `TmxObjectGroup` + `TmxObject` types. Parse `<objectgroup>` with rect, ellipse, point, polygon, polyline, text, tile objects. |
| **`<properties>`** | New `TmxProperties` type. Parse `<properties>` on map, layer, object, tileset, tile. |
| **gzip decompression** | Add gzip support alongside zlib in data decoding. |
| **Layer properties** | Add `opacity`, `visible`, `offsetX`, `offsetY` to `TmxLayer`. |
| **GID resolution** | `resolveGid(map, gid)` → `{ tileset, localId }` for working with multi-tileset maps. |

## Out of scope

Group layers, image layers, infinite/chunked maps, Wang sets, terrain, animations, templates, JSON format, map `backgroundcolor`, `renderorder`, zstd.

## Subtasks

- [x] Refactor `TmxTileset` + `TmxMap` for multiple tilesets
- [x] Add `resolveGid()` helper
- [x] Add gzip decompression support
- [x] Add `TmxObjectGroup` + `TmxObject` types + parsing
- [x] Add `TmxProperties` type + parsing
- [x] Add layer `opacity`/`visible`/`offsetX`/`offsetY`
- [x] Unit tests for all new features
- [x] Update existing tests for multi-tileset API change
- [x] Typecheck + lint + test — all green
- [x] Regenerate `engine-api.md`
- [ ] Update ledger row
