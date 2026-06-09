# Spacewar! — review fixes

Follow-up to the [original build](spacewar.md). A post-build review found
the game **auto-plays to a win with zero input** plus several lesser bugs. This
plan tracks the fixes, the missing spec item (sound), and the ledger updates.

## Findings → fixes

- [x] **#1 CRITICAL — auto-death-loop.** Ships spawn symmetrically on the
  star's horizontal axis with zero velocity, so gravity pulls them into a
  head-on collision at the centre → mutual kill → instant respawn → repeat →
  game over in ~3s. **Fix:** spawn each ship with a tangential orbital velocity
  (`v = √(G/r)`, perpendicular to the star), so they orbit (diametrically
  opposite) instead of falling straight in.
- [x] **#2 HIGH — firing while thrusting self-destructs.** Torpedo spawns at
  offset `SHIP_RADIUS` (12) < combined radius (14.5) and doesn't inherit ship
  velocity, so at high forward speed it stays overlapping its own ship at
  collision time. **Fix:** torpedoes inherit the firing ship's velocity +
  muzzle offset clears the combined radius.
- [x] **#3 LOW — thrust-flame entity leak.** Ship death despawns the ship but
  not its attached flame; respawn makes a new one → orphans accumulate until
  `clearAll()`. **Fix:** `despawnShip()` destroys the attached flame too.
- [x] **#4 LOW — mutual-collision scoring.** Ship↔ship credits *both* players
  +1 and reports a draw-at-5 as "Player 1 Wins!". Spec says "both lose".
  **Fix:** ship↔ship is a neutral reset (both die, no score, no win); only
  torpedo↔ship scores.
- [x] **Nits.** Remove dead `_player` param from `spawnTorpedo`; make the
  `movement` system's ordering explicit (`runAfter: ['gravity']`); use
  `WIN_SCORE` constant in collision.
- [x] **Sound effects** (the one unmet spec bullet). Lightweight one-shot SFX
  via `modules/audio` (`WebAudioProvider`, solitaire pattern) using
  `examples/assets/kenney_space-shooter-remastered/Bonus`: laser on fire, zap
  on ship destroyed, lose on game over. Event-driven (systems stay
  audio-agnostic).

## Validation

- [x] `tsc --noEmit && vite build` clean.
- [x] Browser: with **no input**, ships orbit and scores stay 0 (no auto-win).
- [x] Browser: firing while thrusting forward does not self-destruct.
- [x] Browser: SFX wired (3 clips bundle + load; AudioContext resumes on key
  press). Audible output not machine-verifiable headless.

## Ledger updates ([engine-gap-ledger.md](../roadmap/engine-gap-ledger.md))

- [x] **Two-player / player-slot abstraction** (B19): add spacewar as the 2nd
  consumer (dual-cited: engine `createInput` + spacewar `PlayerSlot` record).
- [x] **Point-attractor / radial gravity force** (new Open row, speculative):
  ABSENT — kinematics/particles bake in constant *downward* gravity only;
  spacewar hand-rolls inverse-square radial accel in `gravity.ts`. 1 radial
  consumer; constant-gravity hand-rollers (flappy/jetpack/platformer-3d) are
  trivial one-liners. Hold — Lunar Lander (#11) likely adds a 2nd.

## Peer review

- [x] `runSubagent` review pass; fix findings; repeat until LGTM. **2 passes:**
  pass 1 flagged a Major (pierce-through torpedo never despawned → multi-kill
  double-scoring) + 2 minors + 1 nit, all fixed; pass 2 returned **LGTM**.
