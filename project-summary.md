# Bastardoids Project Summary

## What This Project Is

Bastardoids is a browser-based top-down 3D space combat prototype built around simple wireframe visuals and Newtonian-like movement on the `xz` plane. The game started as an "Asteroids + Elite-style" prototype, but it has evolved well beyond that:

- the player now has `hull + shield + heat + afterburner`, not lives
- the game includes AI enemy ships, projectiles, progression, skills, audio, and FX
- progression is run-based: XP, scrap, level-ups, skill choices, and active skills reset per run
- the presentation is deliberately lightweight: Three.js line/points visuals, no textured 3D pipeline

This file is meant to preserve the current high-level map for a fresh session.

## Current Tech Stack

- `TypeScript`
- `Vite`
- `Three.js`
- browser `Web Audio API` for SFX/loops
- JSON-based gameplay tuning via `src/gameConfig.json`

The game is currently single-threaded and main-thread driven. This is intentional, not accidental.

## Source Of Truth vs Historical Docs

### Current code is the source of truth

When numerical values or exact behavior conflict:

1. `src/` code
2. `src/gameConfig.json`
3. newer root planning docs
4. older origin docs like `asteroids-context.md`

### Root docs status

- `performance-strategy.md`
  Still relevant as the standing performance philosophy.
- `Implement-Heat-Mechanic.md`
  Still relevant conceptually, but fixed numbers have evolved.
- `EnemyShip-AI-Architecture.md`
  Still relevant conceptually. Current AI is based on this, but tactics/thresholds have been tuned.
- `Run-Based-Progression-Foundation.md`
  Still relevant conceptually. Current progression system implements most of the structure, but active-skill handling has already expanded beyond "Q only".
- `mass-driven-movement-redesign.md`
  Still relevant conceptually and largely implemented.
- `loadout-mass-preparation-pass.md`
  Still relevant conceptually and largely implemented.
- `rules.md`
  Current coding conventions and code-organization guidance.
- `asteroids-context.md`
  Historical origin document. Useful for the original intent, but many numbers and several systems are outdated.
- `typescript-migration-plan.md`
  Historical. The migration is already done.
- `personal-context.md`
  User-profile / collaboration note, not a game design doc.

## Current High-Level Game Systems

- Player ship:
  - mouse aim with crosshair
  - `W/S/A/D` thrusters
  - afterburner on `Shift`
  - fire with left mouse / `Space`
  - active skill keys are reserved as `Q`, `E`, `R`, `F`, `V`
- World:
  - infinite-feeling combat bubble around the player
  - rotating asteroids on the `xz` plane
  - asteroids wrap / persist in a player-relative active area
- Combat:
  - weapons generate heat
  - shields absorb before hull
  - projectiles have mass, damage, range, sounds, hit sounds
- Enemies:
  - utility + steering AI
  - shared locomotion with the player
  - multiple hunter weapon variants
  - timed hunter spawns and reinforcement checks
- Progression:
  - XP and scrap from kills
  - cumulative XP thresholds
  - level-up pause overlay
  - passive and active skill tiers
- FX and feedback:
  - thruster particles
  - shield sphere
  - explosion shards
  - audio loops and one-shot SFX
  - off-screen enemy trackers

## Current Code Structure

### Core runtime

- [src/main.ts](</d:/Documents/Codex playground/src/main.ts>)
  Main orchestrator. Still the central game loop and the most important file to read first.
- [src/gameConfig.json](</d:/Documents/Codex playground/src/gameConfig.json>)
  Main tuning surface for world, player, afterburner, thrusters, debug flags, etc.
- [src/types.ts](</d:/Documents/Codex playground/src/types.ts>)
  Shared config/runtime type surface.
- [src/config.ts](</d:/Documents/Codex playground/src/config.ts>)
  Typed config loading.

### Entities and movement

- [src/entities/ships/shipController.ts](</d:/Documents/Codex playground/src/entities/ships/shipController.ts>)
  Shared ship locomotion for player and enemies.
- [src/entities/ships/loadout.ts](</d:/Documents/Codex playground/src/entities/ships/loadout.ts>)
  Installed-item helpers, weapon slot access, total mass resolution.
- [src/entities/projectiles/weaponDefinitions.ts](</d:/Documents/Codex playground/src/entities/projectiles/weaponDefinitions.ts>)
  Weapon stats, projectile mass, installed weapon mass, sounds, heat, damage.
- [src/entities/asteroids/asteroidDefinitions.ts](</d:/Documents/Codex playground/src/entities/asteroids/asteroidDefinitions.ts>)
  Asteroid sizes and rewards.
- [src/entities/enemies/enemyDefinitions.ts](</d:/Documents/Codex playground/src/entities/enemies/enemyDefinitions.ts>)
  Enemy variants and AI-facing ship stats.
- [src/entities/enemies/createEnemyShip.ts](</d:/Documents/Codex playground/src/entities/enemies/createEnemyShip.ts>)
  Enemy runtime instantiation.
- [src/player/createPlayer.ts](</d:/Documents/Codex playground/src/player/createPlayer.ts>)
  Player runtime instantiation, shield mesh, emergency vent effect mesh.

### AI

- [src/ai/enemyShipAi.ts](</d:/Documents/Codex playground/src/ai/enemyShipAi.ts>)
  Enemy decision/perception/steering/firing logic.

### Progression

- [src/player/progression/types.ts](</d:/Documents/Codex playground/src/player/progression/types.ts>)
- [src/player/progression/skills.ts](</d:/Documents/Codex playground/src/player/progression/skills.ts>)
- [src/player/progression/progression.ts](</d:/Documents/Codex playground/src/player/progression/progression.ts>)
- [src/player/progression/resolvePlayerStats.ts](</d:/Documents/Codex playground/src/player/progression/resolvePlayerStats.ts>)
- [src/player/progression/xpTable.ts](</d:/Documents/Codex playground/src/player/progression/xpTable.ts>)

This folder owns run-based progression state, offers, XP thresholds, skill tiers, active-skill bindings, and resolved player stat modifiers.

### UI, camera, audio, visuals

- [src/ui/GameUi.ts](</d:/Documents/Codex playground/src/ui/GameUi.ts>)
  HUD, menus, level-up overlay, enemy trackers.
- [src/camera/CameraRig.ts](</d:/Documents/Codex playground/src/camera/CameraRig.ts>)
  Camera look-ahead, blending movement/facing, tethering.
- [src/audio/AudioSystem.ts](</d:/Documents/Codex playground/src/audio/AudioSystem.ts>)
  Web Audio buffer loading, SFX, looped audio.
- [src/visuals/shipModels.ts](</d:/Documents/Codex playground/src/visuals/shipModels.ts>)
  Wireframe ship silhouettes.
- [src/visuals/createShipVisual.ts](</d:/Documents/Codex playground/src/visuals/createShipVisual.ts>)
  Shared ship visual builder.
- [src/visuals/ExplosionSystem.ts](</d:/Documents/Codex playground/src/visuals/ExplosionSystem.ts>)
  Shared explosion/debris system.
- [src/visuals/Weapons.ts](</d:/Documents/Codex playground/src/visuals/Weapons.ts>)
  Projectile visuals.
- [src/visuals/BackgroundStars.ts](</d:/Documents/Codex playground/src/visuals/BackgroundStars.ts>)
- [src/visuals/ReferenceGrid.ts](</d:/Documents/Codex playground/src/visuals/ReferenceGrid.ts>)
- [src/visuals/WorldScenery.ts](</d:/Documents/Codex playground/src/visuals/WorldScenery.ts>)

## Important Current Design Decisions

### 1. Performance strategy

From `performance-strategy.md`:

- keep active gameplay on the main thread
- optimize active-radius simulation first
- reduce AI/perception frequency before introducing concurrency
- prefer spatial partitioning and LOD before workers
- Web Workers are future candidates for far-world or background tasks, not current combat logic

This is still the operating philosophy.

### 2. Heat model

From `Implement-Heat-Mechanic.md`, evolved into current code:

- ships track `heat`, `vent`, and `thermalCap`
- firing adds weapon heat
- passive venting slows above the soft cap
- the soft cap is now derived dynamically from `thermalCap * 2 / 3`
- heat is player-visible in the HUD, but applies to enemies too

Heat is now also a foundation for active skills like `Emergency Vent` and `Hot Shots`.

### 3. Enemy AI architecture

From `EnemyShip-AI-Architecture.md`, the important decisions that survived:

- utility + steering hybrid, not FSM-only
- shared locomotion with player
- perception decoupled from per-frame movement
- slot/ring-based engagement around the player
- tactic hysteresis to reduce thrashing
- threat-aware collision avoidance

Current AI has been tuned heavily since the doc, but this is still the conceptual model.

### 4. Progression model

From `Run-Based-Progression-Foundation.md`, evolved in code:

- progression is run-only
- score was removed
- scrap is the in-run currency shown on HUD
- main menu stores highest XP across runs
- XP is cumulative and does not reset on level-up
- skills are tiered and can be offered again
- every third level is the active-skill cadence
- resolved player stats are built from base config + passive tiers + temporary active effects

Note: the doc says one active skill on `Q`, but current code has already expanded active-skill binding support and reserves `Q/E/R/F/V`.

### 5. Mass-driven movement

From `mass-driven-movement-redesign.md`, now implemented:

- thrust values are treated as force-like values
- acceleration is `thrust / mass`
- turning uses yaw inertia
- speed approach near cap is softened by thrust falloff
- there is still no passive drag while coasting
- `enginePowerMw` exists as a future hook, but is not yet driving runtime behavior

This means mass matters for both collisions and flight.

### 6. Loadout and module mass

From `loadout-mass-preparation-pass.md`, now implemented:

- ship base mass is `hullMass`
- runtime ship mass is `hullMass + installed item masses`
- today that mostly means installed weapon mass
- weapons have both:
  - installed `mass`
  - fired `projectileMass`
- ship weapon slot naming uses `weapon1`

This is explicitly laying groundwork for future additional modules and weapon slots.

## Current Enemy Setup

The old single `hunter` definition no longer exists. Current hunter-family variants are:

- `Hunter T`
  - kinetic torpedo variant
- `Hunter L`
  - laser variant
- `Hunter P`
  - plasma orb variant

Current encounter behavior:

- no hunters at game start
- at `30s`, two hunters spawn as an opposed pair around the player
- every `45s` after that, the game checks nearby active enemies
- if fewer than `2` are nearby, it spawns one more random hunter variant

## Current Skill Notes

Not all future progression ideas are implemented, but the system already supports:

- passive skill tiers
- active skill tiers
- repeated offers of already-owned skills
- active skill key bindings

Known active skills currently in code:

- `Hot Shots`
- `Emergency Vent`

## What Has Clearly Evolved Away From The Original Asteroids Prototype

These old assumptions should not guide a new session without checking code first:

- player lives
- score as the main progression metric
- large asteroid naming
- static pre-heat combat model
- purely player-only flight logic in `main.ts`
- fixed enemy-less sandbox gameplay

## Good Entry Points For A Fresh Session

Open these first:

1. [src/main.ts](</d:/Documents/Codex playground/src/main.ts>)
2. [src/gameConfig.json](</d:/Documents/Codex playground/src/gameConfig.json>)
3. [src/types.ts](</d:/Documents/Codex playground/src/types.ts>)
4. [src/entities/ships/shipController.ts](</d:/Documents/Codex playground/src/entities/ships/shipController.ts>)
5. [src/ai/enemyShipAi.ts](</d:/Documents/Codex playground/src/ai/enemyShipAi.ts>)
6. [src/player/progression/skills.ts](</d:/Documents/Codex playground/src/player/progression/skills.ts>)
7. [src/player/progression/progression.ts](</d:/Documents/Codex playground/src/player/progression/progression.ts>)
8. [src/ui/GameUi.ts](</d:/Documents/Codex playground/src/ui/GameUi.ts>)

If a fresh session needs the design rationale, read these after the files above:

1. `performance-strategy.md`
2. `EnemyShip-AI-Architecture.md`
3. `Run-Based-Progression-Foundation.md`
4. `mass-driven-movement-redesign.md`
5. `loadout-mass-preparation-pass.md`
6. `Implement-Heat-Mechanic.md`

## Practical Guidance For Future Sessions

- Trust the current code over the oldest design notes.
- Expect many values in root docs to be directionally useful but numerically stale.
- `main.ts` is still the orchestration center, but many important systems have already been extracted.
- When changing player behavior, check whether the correct place is:
  - base config
  - resolved progression stats
  - shared ship controller
  - weapon definitions
- When changing enemy behavior, check both:
  - `enemyDefinitions.ts`
  - `enemyShipAi.ts`
