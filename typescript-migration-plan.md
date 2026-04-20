# TypeScript Migration Plan

## Summary

This document describes the current shape of the Bastardoids prototype and the exact incremental path to migrate it from JavaScript to TypeScript without changing gameplay behavior.

The migration should stay behavior-preserving and incremental:

- Keep the current Vite + Three.js setup.
- Convert the current single-entry prototype first.
- Add types before doing meaningful architecture changes.
- Postpone larger module extraction until the TypeScript version builds and runs cleanly.

## Current Project Snapshot

- Runtime entrypoint: `src/main.js`
- Config source: `src/gameConfig.json`
- Stylesheet: `src/styles.css`
- Tooling: Vite and TypeScript are already installed, and `tsconfig.json` exists with `strict: true`
- Current runtime organization: the game mostly lives inside one `BastardoidsApp` class of about 1.3k lines
- Current major subsystems:
  - config loading
  - scene and camera setup
  - player movement
  - lasers
  - asteroids
  - collisions
  - HUD
  - afterburner and shield
  - reference grid
  - background stars
  - thruster particles

## Migration Target

The first migration pass should end in this state:

- Rename `src/main.js` to `src/main.ts`.
- Keep `src/gameConfig.json` as JSON and import/type it via `resolveJsonModule`.
- Preserve the single main class for the first pass.
- Add explicit TypeScript types for config, player state, asteroid state, laser state, thruster particles, and key DOM references.
- Keep public runtime behavior unchanged unless TypeScript exposes an actual bug.
- Do not mix the TypeScript conversion with feature work.

### Initial Type Surface

Add these config interfaces:

- `GameConfig`
- `WorldConfig`
- `PlayerConfig`
- `LaserConfig`
- `ThrusterConfig`
- `AfterburnerConfig`
- `AsteroidSizeConfig`
- `AsteroidsConfig`
- `SpawningConfig`
- `PhysicsConfig`

Add these runtime entity types:

- `PlayerState`
- `AsteroidEntity`
- `LaserEntity`
- `ThrusterParticle`
- `BackgroundStarTile`

## Migration Phases

### Phase 0: Baseline

- Confirm `npm run build` passes before changes.
- Record the current file layout and important config sections.
- Treat current runtime behavior as the migration baseline.
- Explicitly start from the current game behavior, not from `src/main_old.js`.

### Phase 1: Type Scaffolding Without Reorganization

- Add TypeScript interfaces and helper types in `src/types.ts`.
- Switch config loading to a typed import or typed parse path.
- Rename `src/main.js` to `src/main.ts`.
- Type class fields, constructor input, DOM queries, arrays, timers, and nullable references.
- Replace implicit `any` hotspots with explicit unions or nullable types.
- Keep current method boundaries and logic flow intact.

### Phase 2: Compile-Clean Conversion

- Resolve strict-mode errors one subsystem at a time.
- Add small helper types for repeated patterns where they reduce noise.
- Avoid unsafe non-null assertions except where guarded immediately above.
- Prefer narrow types over broad casts.
- Keep runtime behavior fixed while removing type errors.

### Phase 3: Low-Risk Cleanup After Green Build

- Extract only obvious leaf modules:
  - `src/config.ts`
  - `src/types.ts`
  - `src/utils.ts` for small pure helpers such as `wrapAngle`
- Keep gameplay systems inside `main.ts` for this pass.
- Do not split movement, combat, camera, or spawning systems yet.

### Phase 4: Optional Post-Migration Modularization

This phase is out of scope for the first migration pass. Only plan it after TypeScript is stable.

Candidate module splits for a later pass:

- player and flight systems
- weapons and projectiles
- asteroid and spawning systems
- HUD and UI
- environment, grid, and starfield

## Implementation Conventions

Use these defaults during the conversion:

- Use `interface` for config objects and `type` for unions or helper aliases.
- Keep `THREE.Vector3` and other Three.js runtime objects as-is; do not wrap them in custom math types.
- Type collections explicitly, for example `AsteroidEntity[]` and `LaserEntity[]`.
- Type nullable DOM references and runtime-created meshes with `| null`.
- Do not introduce runtime schema validation in this pass.
- Do not introduce separate classes for every entity in this pass.
- Do not convert JSON config into TypeScript constants in this pass.

## Acceptance Checks

The migration should be considered successful for the first pass when all of the following are true:

- `npm run build` passes with `tsc --noEmit` and Vite build.
- The game launches and loads config successfully.
- Player movement, rotation, strafing, afterburner, shield, lasers, asteroid spawning, collisions, HUD, grid, and starfield still function.
- No new runtime errors appear in the browser console on startup or during basic play.
- Obvious config edits in `src/gameConfig.json` still affect the game after reload.
- There are no silent behavior changes to camera behavior, thrust model, or collision timing during the TypeScript-only pass.

## Manual Smoke Scenarios

- Start the game and move or fire immediately.
- Use `W`, `S`, `A`, `D`, mouse aim, and `Shift`.
- Take damage and confirm the invulnerability shield shows.
- Survive long enough to verify asteroid spawning, cleanup, and starfield continuity.
- Verify HUD updates, including velocity readouts and the afterburner gauge.

## Assumptions

- The deliverable for the next session is this handoff markdown document, not the full migration itself.
- The migration should remain incremental and behavior-preserving.
- The existing Vite and TypeScript setup is sufficient and should be reused.
- Large-scale codebase reorganization is intentionally deferred until after `main.ts` compiles cleanly.
