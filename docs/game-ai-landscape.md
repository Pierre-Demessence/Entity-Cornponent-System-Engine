# Game AI landscape

A map of the "AI things" found in games — not just decision algorithms,
but everything usually filed under game AI. For each: a plain one-liner,
how common it is **built into engines**, and this engine's status.

This is a reference for deciding what to build next; the concrete module
plan lives in the [ECS module backlog](roadmap/ecs-module-backlog.md) (see the
`modules/steering`, `modules/fsm`, `modules/behavior-tree`, and
`modules/ai` entries).

## Legend

- **✅ shipped** — a `@pierre/ecs` module already covers it.
- **🔜 backlog** — planned / next up.
- **🟩 engine-standard** — Unity / Unreal / Godot ship it in core.
- **🟨 plugin / AAA-bespoke** — usually an add-on or hand-rolled per game.
- **🟥 niche / research** — rare in shipped games.

## 1. Decision-making — "what should I do?" (the brain)

- **Finite State Machine (FSM)** ✅ 🟩 — named states + rules to switch
  ("patrol → chase when I see you"). The workhorse.
  → `@pierre/ecs/modules/fsm`.
- **Hierarchical FSM (HFSM)** 🟨 — FSMs nested inside states, so you don't
  get 50 tangled states.
- **Behaviour Tree (BT)** ✅ 🟩 — a tree of prioritised, reusable
  behaviours re-checked every frame. Unreal ships one as the default.
  → `@pierre/ecs/modules/behavior-tree`.
- **Utility AI** (utility system / "infinite axis") � 🟨 — every possible
  action scores itself 0–1 from the situation; pick the highest. "How
  much do I *want* to eat vs flee right now?" The Sims uses this. Good
  when priorities are fuzzy rather than strict. The likely next AI pick.
- **GOAP (Goal-Oriented Action Planning)** ✅ 🟨 — actions have
  preconditions/effects; a planner (A\*) finds a *sequence* to reach a
  goal. Emergent multi-step plans nobody hand-authored (F.E.A.R.).
  → `@pierre/ecs/modules/goap`.
- **HTN (Hierarchical Task Network) planning** 🟥 — like GOAP but plans by
  breaking big tasks into subtasks. Some AAA (Guerrilla/Horizon).
- **Rule-based / decision tree / scripted `if`-trees** 🟩 — hand-written
  logic. Everywhere; not really an "engine feature," just code.
- **Blackboard** ✅ (as the per-agent `ctx`) 🟩 — shared scratchpad the AI
  reads/writes (target, last-seen position). Not a decider itself — the
  notebook the BT/FSM writes on. Unreal ships a formal Blackboard; this
  engine does it via the per-agent context object.

## 2. Movement & navigation — "how do I move / get there?"

- **Steering behaviours** ✅ 🟨 — seek/flee/arrive/wander/flocking; local
  reactive velocity (Reynolds). → `@pierre/ecs/modules/steering`.
- **Pathfinding (A\* / Dijkstra)** ✅ 🟩 — shortest route on a grid/graph.
  → `@pierre/ecs/modules/pathfinding`.
- **Navigation mesh (NavMesh)** 🟩 — walkable-area polygons agents path
  across in continuous 3D space; the standard 3D nav solution. This engine
  has grid A\*, not a nav mesh.
- **Flow fields** 🟨 — precompute one "which way to the goal" arrow per
  cell so *thousands* of units share it (RTS).
- **Local avoidance (RVO / ORCA)** 🟨 — agents sidestep each other so
  crowds don't clip. (The stealth-guard example hand-rolls wall-avoid;
  RVO is the agent-vs-agent version.)
- **Path smoothing / following / string-pulling** 🟨 — turn a jagged grid
  path into natural movement.
- **Crowd simulation** 🟨 — many agents navigating together (Unreal
  MassAI, Unity DOTS crowds).

## 3. Perception — "what do I know about the world?"

- **Line-of-sight / vision cones** ✅ 🟩 — "can I actually see the target?"
  (raycasts + FOV). LoS in the stealth-guard example; FOV in
  `@pierre/ecs/modules/grid-based`. Unreal ships AI Perception.
- **Hearing / sound stimuli** 🟨 — react to noise events (gunshots,
  footsteps).
- **Unified perception system** 🟨 — senses (sight/sound/touch) + short-term
  memory as one component. Unreal ships it; usually a plugin elsewhere.

## 4. Spatial / tactical reasoning

- **Influence maps** 🟨 — a grid of "how dangerous/valuable is *here*" that
  spreads and decays; drives flanking, retreating, where-to-hide. AAA,
  rarely core.
- **Spatial partitioning for AI** ✅ 🟩 — "what's near me?" fast (hash
  grid). Makes perception scale. → `@pierre/ecs/modules/spatial`.
- **Cover / tactical-point systems** 🟨 — precomputed good spots to shoot
  from or hide behind (shooters).
- **Waypoint graphs** 🟨 — hand-placed nav dots; the simpler/older nav
  before nav meshes.

## 5. Group & coordination

- **Flocking / boids** ✅ 🟨 — emergent group motion from the steering trio
  (separation/alignment/cohesion). Shipped in the boids example.
- **Squad / team AI** 🟨 — coordinated roles and shared plans.
- **Formations** 🟨 — units hold a shape while moving (RTS).

## 6. Procedural generation (the "generative" side of AI)

- **Procedural content generation (PCG)** 🟨→🟩 — algorithmically build
  levels/dungeons/terrain. Increasingly core (Unreal PCG framework).
- **Noise (Perlin/Simplex)** 🟩 — the math under terrain/textures/clouds.
- **WFC / BSP / cellular automata / drunkard's walk** 🟨 — classic dungeon
  & level generators.
- **Grammars / L-systems** 🟥 — rule-based generation of plants, roads,
  cities.

## 7. Learning / adaptive (the "real AI/ML" corner)

- **Reinforcement learning / neural nets** 🟥 — agents learn by
  trial-and-error (Unity ML-Agents toolkit). Rare in shipped games.
- **Genetic algorithms** 🟥 — evolve parameters/behaviours over
  generations.
- **Dynamic difficulty adjustment** 🟨 — quietly tune challenge to the
  player (Left 4 Dead's "Director").

## 8. Animation-adjacent AI (motion that *looks* smart)

- **Animation state machines** 🟩 — the same FSM idea applied to animation
  (Unity Animator, Godot AnimationTree). Ubiquitous.
- **Motion matching** 🟨 — pick animation frames from a big database to
  match the desired movement (AAA, emerging engine feature).
- **Inverse kinematics (IK)** 🟩 — pose limbs to reach a target (foot
  placement on slopes). Engine-standard.

## Where this engine stands

The reached-for decision/movement primitives are shipped —
**steering, FSM, behaviour tree, and GOAP** — plus the supporting cast:
A\* pathfinding, FOV / line-of-sight, spatial hash, timers/cooldowns, and
a blackboard via the per-agent context.

The obvious remaining gaps, roughly in bang-for-buck order:

1. **Utility AI** — fuzzy score-based action selection; small and very
   reusable, complements FSM/BT/GOAP. The likely next AI pick.
2. **HTN planning** — authored task decomposition, when GOAP's emergent
   search isn't the right fit.
3. **Navigation beyond grid A\*** — a NavMesh or flow fields (continuous
   space / many-agent).
