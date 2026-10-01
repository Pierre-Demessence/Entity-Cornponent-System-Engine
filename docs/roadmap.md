# Roadmap

The games built next, as examples under [`examples/`](../examples/): the
[20 Games Challenge](https://20_games_challenge.gitlab.io/) list, in the order
of its [List of Games](https://20_games_challenge.gitlab.io/games/) page, each
built on unmodified `@pierre/ecs`. A game leaves this list when its example
lands; [`examples/manifest.ts`](../examples/manifest.ts) records which rung each
challenge example covers.

## How a rung is done

- Build games **in list order**. Skip only games that are already fully made.
  When a game could go either way, let [engine usage](agent/engine-usage.md)
  break the tie: it ranks the modules whose value exports no example reaches.
- Implement **everything in the game page's _Goals_ section**. _Stretch Goals_
  are optional — take the ones that are interesting or exercise a new engine
  surface.
- The game follows the example conventions: its own Vite app and
  `package.json`, a manifest entry with its `challenge` rung, a loader, and a
  hub dependency (`scripts/examples.test.ts` names whichever is missing).
- Engine gaps it surfaces go in the backlog's
  [untriaged engine gaps](backlog.md#untriaged-engine-gaps).
- When it lands, delete its row here.

## Remaining rungs

| # | Game | Page | Engine surface it exercises |
|---|---|---|---|
| 13 | Tic-Tac-Toe | [link](https://20_games_challenge.gitlab.io/games/tic_tac_toe/) | A second `turn-based` consumer; a `render-dom` board |
| 14 | Conway's Game of Life | [link](https://20_games_challenge.gitlab.io/games/life/) | `examples/game-of-life` exists as a subsystem demo; check it against the Goals before starting |
| 15 | Mario Bros | [link](https://20_games_challenge.gitlab.io/games/mario/) | `kinematics` V2 (slopes, one-way platforms) |
| 16 | Pitfall | [link](https://20_games_challenge.gitlab.io/games/pitfall/) | `kinematics` V2 |
| 17 | VVVVVV | [link](https://20_games_challenge.gitlab.io/games/vvvvvv/) | `kinematics` V2 |
| 18 | Worms | [link](https://20_games_challenge.gitlab.io/games/worms/) | `destructible-terrain`; turn timers, `TurnCycler`, `noise` terrain |
| 19 | Dig Dug | [link](https://20_games_challenge.gitlab.io/games/dig_dug/) | `destructible-terrain` |
| 20 | (Super) Motherload | [link](https://20_games_challenge.gitlab.io/games/motherload/) | `destructible-terrain` |
| 21 | Super Monkey Ball | [link](https://20_games_challenge.gitlab.io/games/monkeyball/) | The 3D-math cluster: quaternions, `obb3VsSphere3`, `sphere3VsPlane3`, frustum culling |
| 22 | Star Fox | [link](https://20_games_challenge.gitlab.io/games/star_fox/) | |
| 23 | Crash Bandicoot | [link](https://20_games_challenge.gitlab.io/games/crash/) | |
| 25 | Mario Kart | [link](https://20_games_challenge.gitlab.io/games/mario_kart/) | |

The challenge page also lists an extended catalogue (Chrome Dinosaur, Tetris,
Zelda, …); it extends this table once the list above is exhausted.

## Coverage candidates outside the list

Examples that reach engine surface no example touches, without a challenge rung:

- **Match-3** — the honest consumer for `tween` + `easing` (swaps, falls,
  cascades), plus `timer`, `pingPong`, `drag-drop`, `save` and
  `scene-transition`.
- **3D picking / inspector sandbox** — `screenPointToRay` + `rayVsObb3` /
  `rayVsPlane3` selection, `worldToScreen` labels, an orbit camera with
  `addOrbitZoom`, and a frustum-culling visualiser; most of `camera-3d`'s
  unreached surface with no game design.
