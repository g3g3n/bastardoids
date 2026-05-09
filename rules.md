# Bastardoids Coding Rules

## Purpose

This document defines the standing coding conventions for Bastardoids. Use it to keep the codebase readable as systems grow and more runtime logic moves out of `src/main.ts`.

## Readability

- Write code that is readable without comments.
- Prefer explicit names, small helper functions, and clear data flow over clever compression.
- Keep conditionals and state transitions easy to scan.
- When a block starts needing explanatory comments just to be understandable, first consider whether it should be extracted or renamed.

## Comments

- Add comments only when explaining intent, invariants, external constraints, non-obvious edge cases, or deliberate tradeoffs.
- Do not comment obvious operations.
- Keep comments short and factual.
- Do not use comments to narrate line-by-line behavior.

## Docs vs Source

- Put architecture, module boundaries, and system overviews in markdown docs, not source files.
- Use root markdown docs for project-wide rules, design rationale, and subsystem boundaries.
- Keep source comments local to the code they clarify.

## `main.ts` Role

`src/main.ts` is the composition root and runtime orchestrator, not the long-term home for every gameplay rule.

What should stay in `main.ts`:

- app bootstrap and scene setup
- top-level game loop ordering
- phase transitions such as menu, play, level-up, and game over
- wiring between major systems: player, enemies, projectiles, camera, UI, audio, and visuals

What should usually move out of `main.ts` once a system becomes substantial:

- self-contained visual systems
- particle systems and effect runtimes
- combat resolution and projectile handling
- spawn direction and encounter scheduling
- HUD projection/presentation helpers
- reusable status systems such as heat, shields, and venting

Rule of thumb:

- `main.ts` should answer "what runs, and in what order?"
- modules should answer "how does this subsystem work?"

## Extraction Guidance

- Extract by subsystem ownership, not by arbitrary line-count targets.
- Prefer modules with clear inputs and outputs over modules that reach deep into global app state.
- Move code out when a subsystem has its own state, helpers, tuning rules, or repeated edits.
- Avoid broad rewrites when a small focused extraction will do.

## Naming

- Use names that describe role, not temporary content assumptions.
- Avoid baking placeholder content names into reusable runtime helpers when the logic is really about a broader category.
- When a name starts fighting future expansion, rename it before the surrounding system hardens.
