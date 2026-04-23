# Performance Strategy

## Summary

This document is the standing performance guideline for Bastardoids. It is meant to answer four recurring questions during development:

- when to stay single-threaded
- what to measure first
- what to optimize before changing architecture
- when Web Workers or other off-thread work become worth considering

The default stance for Bastardoids is simple: keep the active combat bubble on the main thread until profiling shows that a specific subsystem is consistently breaking frame budget.

## Current Model

- Bastardoids is a browser game built with TypeScript, Vite, and Three.js.
- The main loop currently runs on the browser main thread.
- Combat and simulation are centered around an active area around the player rather than the whole world.
- Rendering, input, movement, projectiles, collisions, and near-entity behavior should stay on the main thread by default.
- Background work is a future option through Web Workers, not a current requirement.

## Development Phases

### Phase 1: Single-threaded combat bubble

- Keep all active gameplay on the main thread.
- Simulate only nearby entities and the systems that materially affect the player.
- Favor simple data flow and predictable behavior over premature parallelism.
- Treat this as the project default, not a temporary compromise.

### Phase 2: Scale within one thread

- Reduce AI decision frequency for non-critical or distant entities.
- Add simple spatial partitioning for collision, perception, and avoidance before considering workers.
- Separate expensive perception and decision systems from per-frame movement integration.
- Use AI and simulation LOD before adding concurrency.

### Phase 3: Background and off-thread candidates

Good future worker candidates:

- procedural generation
- far-away sector or world simulation
- batched expensive queries
- non-urgent data processing
- reduced-frequency far-AI evaluation

These are better worker targets than active combat logic because they are easier to isolate and less tightly coupled to frame-by-frame rendering.

### Phase 4: Worker adoption threshold

- Only move systems off-thread after profiling shows consistent frame-budget pressure during normal gameplay.
- Introduce workers by subsystem, not as a general rewrite.
- A worker should solve a demonstrated bottleneck, not be added because it feels more engine-like.

## Metrics To Watch

- 60 FPS target means about `16.6ms` total frame time.
- Start worrying when total frame time frequently exceeds budget during ordinary combat, not just extreme stress cases.
- Start profiling subsystem costs once AI or simulation alone regularly consumes several milliseconds.
- Do not treat dozens of ships as automatic justification for multithreading.

Multithreading becomes a serious discussion only when several heavy systems stack together, for example:

- many active ships
- projectile spam
- avoidance and perception checks
- procedural generation
- far-world simulation

## Optimization Order

This is the default optimization order for Bastardoids:

1. Limit active simulation radius around the player.
2. Reduce update frequency for far or low-priority AI.
3. Introduce spatial partitioning for collisions, perception, and avoidance.
4. Separate rendering concerns from simulation concerns.
5. Measure frame-time hotspots.
6. Only then consider workerizing isolated heavy subsystems.

Do not skip from "the game is getting bigger" to "we need multithreading". Optimize algorithmic cost and active-radius limits before concurrency.

## When Workers Become Worth It

Keep on the main thread for now:

- player controls
- enemy steering and combat decisions in the active bubble
- nearby collisions
- weapon firing and hit resolution
- HUD, camera, and render synchronization

Potential worker candidates later:

- procedural chunk or world generation
- far-away simulation outside the active bubble
- expensive batched perception queries
- save and load preprocessing
- large data preparation tasks

Workers become worth it when a specific isolated subsystem is both:

- expensive enough to matter in frame time
- decoupled enough to run without direct scene graph ownership

In practice, this means Web Workers should not own Three.js scene objects. They should consume plain data and return plain data.

## Defaults And Rules

- Do not multithread because it feels engine-like.
- Profile first, then isolate the real bottleneck.
- Optimize algorithmic cost and active-radius limits before concurrency.
- New gameplay systems should be written with clean subsystem boundaries so they can move off-thread later if needed.
- Avoid hidden cross-system state dependencies.
- Prefer fixed or reduced-frequency decision ticks for AI over per-frame expensive reasoning.
- Any future workerized subsystem must have clear input and output payloads and no direct Three.js object ownership.
- Three.js scene graph updates remain main-thread.
