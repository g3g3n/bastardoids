# Run-Based Progression Foundation

## Summary
Add a **run-only** player progression layer that grants **XP, levels, scrap, skill choices, and one active-skill slot on `Q`**, while keeping future persistent unlocks separate.

This pass should do four structural things before the skill list grows:
- move progression and offer-generation logic out of `main.ts`
- introduce a **resolved player stats** layer so passive/active bonuses do not mutate base config directly
- add a distinct **`levelUp` gameplay state** instead of overloading the current menu/game-over flow
- replace the old score system with **scrap in-run** and **highest XP across runs** as the persisted run metric

## Key Changes
### 1. Progression data and runtime state
- Add a `src/player/progression/` area for:
  - a cumulative `xpTable` (`level 1 = 0 XP`, `level 2 = 15 XP`; higher levels can start as editable placeholders)
  - skill definitions
  - progression/controller logic
  - player stat resolution helpers
- Add a run-scoped progression state with:
  - `level`, `totalXp`, `scrap`
  - `pendingLevelUps`
  - current level-up offers
  - owned skills with **tier/level tracking**
  - one active-skill slot and its runtime state
  - current offer count (`3` by default, modifiable by skills later)
- Keep this separate from future meta-unlocks. Do not add persistence for progression now.

### 2. Reward sources, XP flow, and replacing score
- Add reward fields to destructible definitions:
  - `xpReward`
  - `scrapReward`
- Seed current content as data-driven rewards:
  - small asteroid: `1 XP / 1 scrap`
  - hunter: `8 XP / 12 scrap`
  - medium asteroid: provisional `2 XP / 2 scrap` unless later rebalanced
- Remove the current in-run `score` system from gameplay.
- Replace reward handling with a progression reward path that:
  - awards XP and scrap
  - recalculates level from cumulative XP
  - queues multiple level-ups if a single kill crosses more than one threshold
- Replace persisted `highScore` with persisted **highest XP achieved across all runs**.
- On the main menu:
  - replace `High score` with `High score (XP)`
  - show the stored highest total XP from any completed run
- When a run ends:
  - compare that run’s `totalXp` against stored highest XP
  - update storage if it is a new record

### 3. Skill system, tiers, and stat application
- Model skills as definitions with:
  - `id`, `name`, `description`
  - `kind: "passive" | "active"`
  - `currentTier` / `maxTier` support
  - eligibility / repeat rules
  - weighted offer metadata
  - modifiers and optional drawbacks
- Skills must be **repeat-offer capable**:
  - a previously chosen passive or active skill may appear again on later level-ups
  - selecting it again advances its tier and improves its bonuses/effects
- Introduce a **resolved player stats** step so gameplay reads:
  - base player config
  - plus passive skill tiers
  - plus temporary active-skill effects
- Route all player-affected values that skills may change through the resolver, especially:
  - `thermalCap`, `vent`
  - weapon range
  - fire rate / cooldown speed
  - movement / maneuverability values
  - any future “number of choices offered” bonus
- Do not mutate `gameConfig` values permanently when a skill is chosen.
- For active skills:
  - support one equipped active skill in v1, triggered with `Q`
  - support duration-based buffs and optional drawbacks
  - support tiered upgrades of that active skill
- Offer generation rules:
  - default to `3` choices
  - every third level (`3, 6, 9, ...`) must include at least one eligible active-skill offer
  - if an active skill is already equipped, that guaranteed active option may be:
    - a tier upgrade of the equipped active
    - an alternative active that would replace it
- Passive skills follow the same tiering principle and can also repeat across future offers.

### 4. UI and input
- Add an XP widget to the HUD:
  - place it to the right of the HEAT gauge
  - show a bold level number on the left
  - vertically center a smaller white/grey XP bar beside it
  - fill represents progress between the current level threshold and the next one
- Replace the old score display in the HUD with **scrap**.
- Add a centered level-up overlay in `GameUi`:
  - variable number of choice cards (start with `3`)
  - click support and `1/2/3/...` keyboard shortcuts
  - show title, short description, passive/active label, and current/next tier info when relevant
- While level-up overlay is open:
  - show the OS cursor again
  - suppress movement/fire/active-skill input
  - keep the scene visible behind the overlay
- Keep the rest of the HUD intact unless a progression element specifically replaces it.

### 5. Refactor boundaries before implementation expands
- Keep `main.ts` as the orchestrator, but extract:
  - progression reward / level-up controller
  - skill offer generator
  - resolved player stat builder
  - run-record persistence for highest XP
- `main.ts` should call into those helpers at:
  - reward events
  - HUD update
  - player firing / heat / movement reads
  - active-skill activation
  - end-of-run record update
- Do not refactor enemy progression or a generic RPG framework yet; this pass is player-only.

## Test Plan
- XP is granted on asteroid and ship kills and total XP never resets on level-up.
- Reaching `15 XP` advances the player from level `1` to level `2`.
- If one reward crosses multiple thresholds, level-up choices are queued and resolved sequentially.
- Small asteroid grants `1 XP / 1 scrap`; hunter grants `8 XP / 12 scrap`.
- The old in-run score is gone from gameplay HUD and reward handling.
- Scrap appears in the HUD where score used to be.
- XP bar fills correctly between thresholds and level number updates immediately.
- Level-up pauses gameplay completely and resumes only after all pending picks are resolved.
- Cursor hides during gameplay and reappears during level-up overlay.
- Passive and active skills can both be offered again on later levels and correctly increase tier.
- Every third level includes at least one eligible active-skill offer.
- Pressing `Q` activates the equipped active skill only during normal gameplay.
- Heat, fire rate, movement, and range modifiers continue to work through the same runtime systems after the resolver is introduced.
- Main menu now shows `High score (XP)` and stores the highest total XP achieved across runs.

## Assumptions
- Progression is **run-only** for now: XP, level, scrap, and chosen skills reset on a new run.
- Future persistent unlocks for weapons/modules are out of scope, but the new run progression state should remain separate so that layer can be added later cleanly.
- The first implementation supports **one active-skill slot on `Q`**.
- Higher XP thresholds after level 2 can start as provisional data in `xpTable` and be replaced later without code changes.
- Medium asteroid rewards are not yet specified by design, so `2 XP / 2 scrap` is the provisional default.
- Skill definitions should be authored as tier-aware from the start, even if only a few initial skills are implemented in the first pass.
