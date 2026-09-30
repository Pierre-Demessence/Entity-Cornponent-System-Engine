# Minecraft — 20 Games Challenge #26 (voxel sandbox)

Status: **complete** — registered in the hub, challenge table ticked, gap logged.

Picked from [engine usage](../../agent/engine-usage.md): it ranks `math`,
`camera-3d`, `collision-3d` and `noise` as the modules whose value exports no
example reaches. A voxel sandbox hits all four at once.
[Challenge page](https://20_games_challenge.gitlab.io/games/minecraft/).

## Shape

- Blocks are **not** entities — a chunk is. Each chunk entity carries a
  `Chunk` component (grid coords, mesh version, visibility) plus
  `Position3D` + `ShapeAabb3D` for its bounds; the voxel bytes live in a
  `VoxelGrid` owned by the game's world class.
- Terrain is pure functions of a seed (`worldgen.ts`), testable without three.js.
- Player collision is a custom voxel sweep built on `aabb3VsAabb3Swept`
  (voxels have no entities for `modules/kinematics-3d` to iterate).
- Picking casts `screenPointToRay` through the crosshair and tests candidate
  voxels with `rayVsAabb3`; its entry axis gives the face for block placement.

## Checklist

- [x] Plan
- [x] Scaffold package (`package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`)
- [x] `blocks.ts` + `voxels.ts` (`VoxelGrid`, sweep, raycast) with tests
- [x] `worldgen.ts`: `fbm2D`/`perlin2D` heightmap, `valueNoise2D` biome mask,
      `simplex3D` caves, `fbm3D` overhangs, seeded trees — with tests
- [x] Chunk entities, dirty-version remeshing, face-culled chunk meshes
- [x] Frustum culling of chunks (`camera3DFrustum` + `frustumIntersectsAabb`)
- [x] First-person controller with voxel collision, jump, sprint
- [x] Break / place blocks (LMB / RMB, hotbar 1-5), target highlight
- [x] HUD: hotbar, crosshair, chunk stats, `worldToScreen` home beacon
- [x] Register in manifest, loaders, hub `package.json`; tick the challenge table
- [x] Regenerate `docs:api` / `docs:usage`; lint, typecheck, tests green
- [x] Log engine gaps in the gap ledger; move this plan to `docs/plans/done/`
