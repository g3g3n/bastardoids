# `main.ts` Three-Pass Refactor Plan

## Summary

- Keep this refactor behavior-preserving. No gameplay retuning, no opportunistic redesign, and no unrelated cleanup beyond small extraction-safe naming tidy-ups.
- Use a hybrid module style: small stateful classes for runtime-owned subsystems, plain modules for pure helpers.
- Keep `src/main.ts` as the composition root: bootstrap, phase transitions, top-level update order, and wiring between major systems stay there.
- Place extracted code by ownership:
  - visual runtime modules under `src/visuals/`
  - gameplay/runtime subsystems under `src/systems/`
- Each pass must end build-green and manually smoke-tested before moving on.

## Implementation Changes

### Pass 1: Extract Thruster Particle Runtime to `src/visuals/`

- Create a stateful visual module under `src/visuals/`, preferably `ThrusterParticleSystem.ts`.
- Move particle-specific state out of `main.ts`: point cloud geometry/material, particle pool, particle buffers, emission carry, particle simulation, emitter math, geometry sync, and reset lifecycle.
- Move these responsibilities into the new module:
  - particle setup and scene attachment
  - per-frame particle update
  - player/enemy thruster emission
  - particle buffer sync
  - particle reset on run cleanup
- Keep these in `main.ts` for this pass:
  - player thruster input state
  - enemy thruster intent/state sync
  - afterburner gameplay state and audio decisions
  - top-level `step()` ordering
- `main.ts` should only construct the visual runtime, attach it to the scene, call `thrusterParticles.update(...)`, and call `thrusterParticles.reset()` during cleanup.

### Pass 2: Extract Combat Runtime to `src/systems/`

- Create `src/systems/CombatSystem.ts` as a stateful class.
- Move combat-owned runtime state out of `main.ts`: projectile collection and player primary-fire cooldown.
- Move these responsibilities into the new system:
  - player/enemy primary weapon firing
  - projectile creation and removal
  - projectile integration and expiry
  - projectile hit detection
  - damage application
  - kill reward logic, including the current enemy proximity XP rule
- Keep these in `main.ts`:
  - authoritative player, enemy, and asteroid entity collections unless the extraction naturally centralizes projectile ownership in combat
  - AI decision making
  - progression/stat resolution
  - top-level orchestration and phase handling
- `CombatSystem` should receive current entity references each frame plus injected callbacks for side effects: explosion spawning, reward granting, game-over flow, collision-ring cleanup, scene add/remove, and SFX playback.
- Do not change existing combat rules in this pass.

### Pass 3: Extract Spawn Direction to `src/systems/`

- Create `src/systems/SpawnDirector.ts` as a stateful class.
- Move spawn-owned runtime state out of `main.ts`: asteroid spawn cooldown, initial asteroid seeding state, and T1 enemy spawn timers/checks.
- Move these responsibilities into the new system:
  - initial asteroid seeding
  - repeating asteroid spawn cadence
  - T1 enemy pair timing
  - T1 enemy reinforcement timing/checks
  - spawn offset/randomization helpers
- Keep these in `main.ts`:
  - actual entity construction methods such as `spawnEnemy(...)` and asteroid creation
  - phase ownership and `step()` ordering
  - existing world/camera services already owned elsewhere
- `SpawnDirector` should decide when and where to spawn, then call injected spawn callbacks supplied by `main.ts`.
- Keep current spawn timings, variant pool, and active-range behavior exactly as-is.

## Test Plan

- After each pass, run `npm run build`.
- After each pass, do a short manual smoke run:
  - game starts, menu/game-over/level-up flow still works
  - player movement, firing, and afterburner still work
  - no obvious runtime errors or missing scene objects
- Pass 1 checks:
  - player thruster particles appear on `W/S/A/D`
  - enemy thruster particles still appear
  - afterburner particle ramp still works
  - particles reset correctly on restart and quit-to-menu
- Pass 2 checks:
  - player and enemies still fire correctly
  - projectile lifetime/range still matches current behavior
  - hits on asteroids, player, and enemies still resolve correctly
  - enemy proximity XP within `300` still works
  - asteroid rewards still follow the current rules
- Pass 3 checks:
  - initial asteroids still seed on run start
  - no T1 enemies at game start
  - T1 enemy pair still spawns at `30s`
  - reinforcement check still runs every `45s`
  - asteroid spawn cadence still scales the same way over time

## Assumptions and Defaults

- `src/main.ts` remains the orchestration center after these three passes.
- AI, camera, UI/HUD, progression, and shield/heat/vent runtime are out of scope for this sequence.
- Visual effect runtimes belong in `src/visuals/`; gameplay orchestration subsystems belong in `src/systems/`.
- Each pass should be merged only after it is independently stable, behavior-preserving, and easy to review.
