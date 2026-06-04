# 20 Games Challenge Roadmap

Tracks our pass through the [20 Games Challenge](https://20_games_challenge.gitlab.io/)
game list. We build the games **in the order they appear on the
[List of Games](https://20_games_challenge.gitlab.io/games/) page**, one at a
time, each as a standalone example under [`examples/`](../../examples/) built on
unmodified `@pierre/ecs`.

## How we work this list

- Build games **in list order**. Skip only games that are **already fully made**.
- For each new game, open its detail page (linked below) and implement
  **everything in that page's _Goals_ section**. _Stretch Goals_ are optional —
  pick up only the ones that are genuinely interesting or that exercise a new
  engine surface.
- Each game follows the existing example conventions: own Vite app +
  `package.json`, registered in the [hub](../../examples/hub/). Engine gaps it
  surfaces go in the [engine gap ledger](engine-gap-ledger.md).
- Tick the checkbox here when a game lands.

## Game list (in order)

| # | Game | Year | Page | Status |
|---|------|------|------|--------|
| 1 | Pong | 1972 | [link](https://20_games_challenge.gitlab.io/games/pong/) | ✅ done (`local-pong`) |
| 2 | Flappy Bird | 2013 | [link](https://20_games_challenge.gitlab.io/games/flappy/) | ✅ done (`flappy`) |
| 3 | Breakout | 1976 | [link](https://20_games_challenge.gitlab.io/games/breakout/) | ✅ done (`breakout`) |
| 4 | Jetpack Joyride | 2011 | [link](https://20_games_challenge.gitlab.io/games/jetpack/) | ✅ done (`jetpack`) |
| 5 | Space Invaders | 1978 | [link](https://20_games_challenge.gitlab.io/games/invaders/) | ✅ done (`space-invaders`) |
| 6 | Frogger | 1981 | [link](https://20_games_challenge.gitlab.io/games/frogger/) | ✅ done (`frogger`) |
| 7 | River Raid | 1982 | [link](https://20_games_challenge.gitlab.io/games/river_raid/) | ⬜ |
| 8 | Asteroids | 1979 | [link](https://20_games_challenge.gitlab.io/games/asteroids/) | ✅ done (`asteroids`) |
| 9 | Spacewar! | 1979 | [link](https://20_games_challenge.gitlab.io/games/spacewar/) | ⬜ |
| 10 | Indy 500 | 1979 | [link](https://20_games_challenge.gitlab.io/games/indy/) | ⬜ |
| 11 | Lunar Lander | 1979 | [link](https://20_games_challenge.gitlab.io/games/lander/) | ⬜ |
| 12 | Pac-Man | 1980 | [link](https://20_games_challenge.gitlab.io/games/pacman/) | ⬜ |
| 13 | Tic-Tac-Toe | 1950 | [link](https://20_games_challenge.gitlab.io/games/tic_tac_toe/) | ⬜ |
| 14 | Conway's Game of Life | 1970 | [link](https://20_games_challenge.gitlab.io/games/life/) | ⬜ |
| 15 | Mario Bros | 1985 | [link](https://20_games_challenge.gitlab.io/games/mario/) | ⬜ |
| 16 | Pitfall | 1982 | [link](https://20_games_challenge.gitlab.io/games/pitfall/) | ⬜ |
| 17 | VVVVVV | 2010 | [link](https://20_games_challenge.gitlab.io/games/vvvvvv/) | ⬜ |
| 18 | Worms | 1995 | [link](https://20_games_challenge.gitlab.io/games/worms/) | ⬜ |
| 19 | Dig Dug | 1982 | [link](https://20_games_challenge.gitlab.io/games/dig_dug/) | ⬜ |
| 20 | (Super) Motherload | 2013 | [link](https://20_games_challenge.gitlab.io/games/motherload/) | ⬜ |
| 21 | Super Monkey Ball | 2001 | [link](https://20_games_challenge.gitlab.io/games/monkeyball/) | ⬜ |
| 22 | Star Fox | 1993 | [link](https://20_games_challenge.gitlab.io/games/star_fox/) | ⬜ |
| 23 | Crash Bandicoot | 1996 | [link](https://20_games_challenge.gitlab.io/games/crash/) | ⬜ |
| 24 | Doom | 1993 | [link](https://20_games_challenge.gitlab.io/games/doom/) | ⬜ |
| 25 | Mario Kart | 1992 | [link](https://20_games_challenge.gitlab.io/games/mario_kart/) | ⬜ |
| 26 | Minecraft | 2009 | [link](https://20_games_challenge.gitlab.io/games/minecraft/) | ⬜ |
| 27 | Portal | 2007 | [link](https://20_games_challenge.gitlab.io/games/portal/) | ⬜ |

> The challenge page also lists an extended catalogue beyond these (Chrome
> Dinosaur, Tetris, Zelda, …). We'll extend this table once the curated list
> above is exhausted.
