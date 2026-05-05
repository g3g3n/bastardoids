# EnemyShip AI Architecture for Bastardoids

## Summary
Use a **utility + steering hybrid** for `enemyShip`, optimized for **10+ simultaneous enemies**. This is the best fit for our current flight model because it separates:
- **Decision making**: choose what matters most right now using weighted scores.
- **Movement**: convert that decision into the same thrust/strafe/turn style controls the player uses.

This avoids FSM state explosion once we add “keep distance,” “shoot,” “avoid asteroid,” “avoid projectile,” and “get behind player.” Compared with alternatives:
- **FSM only**: fastest to start, but brittle once behaviors overlap.
- **Behavior tree + steering**: readable, but weighted tradeoffs are more awkward.
- **GOAP**: powerful, but unnecessary until enemies need richer world interactions like cover, pickups, or multi-step plans.

## Key Changes
### 1. Extract shared ship locomotion first
Create a reusable ship control layer and stop keeping player-only flight logic inside `main.ts`.

New shared interface:
- `ShipControlIntent`
- Fields: `targetYaw`, `forwardThrottle`, `reverseThrottle`, `strafe`, `useAfterburner`, `firePrimary`

Implementation choice:
- Keep inputs **analog** for AI (`0..1` or `-1..1`), then map player keyboard input into the same intent shape.
- Shared locomotion applies thrust, strafe, turn damping, speed caps, and afterburner exactly once for both player and enemies.

Why:
- Currently the player movement in `main.ts` already behaves like a simple vehicle controller.
- Reynolds’ steering model explicitly separates **goal/steering** from **locomotion**, which matches this refactor well.

### 2. Add enemy entity and data model
Create `src/entities/enemies/` for gameplay data and runtime state, and `src/ai/` for behavior logic.

Add:
- `EnemyShipDefinition`
- `EnemyShipEntity`
- `EnemyPerceptionSnapshot`
- `EnemyTactic`
- `EnemyBlackboard`

Enemy definition fields:
- `mass`, `radius`, `maxHealth`
- movement stats mirroring player style: `thrust`, `reverseThrust`, `strafeThrust`, `maxSpeed`, `strafeMaxSpeed`, `turnRate`, `turnDamping`
- combat stats: `weapon`, `engageRadius`, `fireRadius`, `preferredRangeMin`, `preferredRangeMax`
- AI tuning: `decisionInterval`, `aimToleranceDegrees`, `avoidanceWeight`, `orbitWeight`, `behindWeight`

Runtime enemy state should include:
- `position`, `velocity`, `yaw`, `yawVelocity`
- `health`
- `preferredRange`
- `orbitDirection`
- `slotAngle`
- `currentTactic`
- `decisionLockUntil`
- `fireCooldownRemaining`
- cached `perception`

Defaults for first enemy:
- `fireRadius = 200`
- `preferredRangeMin = 50`
- `preferredRangeMax = 90`

### 3. Build the AI as 4 layers
#### Perception layer
Runs at reduced frequency, not every frame for every expensive query.

Near enemies:
- utility/perception refresh at `5-10 Hz`

Far enemies:
- utility/perception refresh at `2-4 Hz`

Perception snapshot should cache:
- distance to player
- relative bearing to player
- player velocity
- predicted intercept point for current weapon
- nearest asteroid threat
- nearest projectile threat
- nearest enemy separation pressure
- time-to-collision estimates

For our current repo scale, we'll start with simple loops over entities. Wrap those in query helpers so spatial hashing/grid partitioning can be added later without rewriting AI logic.

#### Utility layer
Score a small set of tactics each decision tick. Recommended starting tactics:
- `closeToRange`
- `holdRange`
- `orbitLeft`
- `orbitRight`
- `breakAway`
- `evadeCollision`
- `dodgeProjectile`
- `repositionBehind`
- `fireWindow`

Use reusable considerations with weights/curves:
- `distanceToPreferredBand`
- `tooCloseToPlayer`
- `tooFarFromPlayer`
- `facingErrorToPlayer`
- `shotOpportunity`
- `collisionThreat`
- `projectileThreat`
- `asteroidThreat`
- `behindPlayerOpportunity`

Decision rules:
- highest score wins
- add **hysteresis / inertia** so enemies do not thrash between tactics
- lock a chosen tactic for a short minimum window, except emergency overrides
- `evadeCollision` and immediate `dodgeProjectile` can hard-interrupt

This directly supports future expansion: avoiding player shots or asteroids is just adding new considerations or raising their weights.

#### Steering layer
Convert the chosen tactic into a desired local control intent.

Recommended steering behaviors:
- **Approach / seek** to a dynamic offset point around the player
- **Arrival** into the preferred range band
- **Orbit / strafe** while facing the player
- **Separation** from player, asteroids, and nearby enemies
- **Obstacle avoidance** for asteroids
- **Projectile evasion** using predicted danger rays / closest-approach checks
- **Offset pursuit** for “get behind player” behavior

Important default:
- do **not** steer directly at the player’s center except in explicit collision or kamikaze behaviors
- instead steer toward an **engagement slot** on a ring around the player

For 10+ enemies, assign each enemy a loose slot:
- `slotAngle` based on enemy id hash + jitter
- slot radius = enemy’s preferred range
- target point = player position + ring offset
- this spreads enemies around the player instead of stacking in front

#### Actuation layer
Each frame:
- compute `targetYaw`
- compute analog throttle/strafe values from steering outputs
- feed `ShipControlIntent` into shared locomotion controller
- independently evaluate firing gate

### 4. Define combat behavior precisely
Engagement logic:
- if player is outside `engageRadius`, move toward engagement slot
- inside `50-90`, prefer orbit/hold-range behavior
- inside `50`, prioritize `breakAway` or `evadeCollision`
- inside `200` and aim is acceptable, fire

Firing gate for v1:
- distance to player or predicted intercept point <= `200`
- yaw error <= `aimToleranceDegrees`
- line of fire not immediately blocked by a nearby asteroid if that check is cheap enough

Use **predictive aiming** by default:
- solve simple lead based on player position, player velocity, shooter position, shooter velocity and projectile speed
- fall back to direct aim if intercept solution is unstable

### 5. Add safety and swarm scalability from the start
For 10+ enemies, include these from v1:
- **separation force** from other enemies
- **emergency avoidance override** when projected time-to-collision with player/asteroid is below threshold
- **AI LOD**
  - full steering for nearby/on-screen enemies
  - reduced decision frequency for distant enemies
  - optional skip expensive projectile-dodge checks for off-screen enemies
- **debug fields** on the blackboard for current tactic, top utility score, target slot, and threat source

Defaults chosen:
- enemies are **independent agents** with loose slot-based coordination, not squad-command AI
- no navmesh or waypoint system
- all AI stays on the same `xz` plane as current gameplay

## Test Plan
Manual acceptance scenarios:
- One enemy starts outside the visible area, closes to engagement range, then stabilizes around `50-90` units instead of ramming the player.
- Enemy fires only when within `200` units and roughly facing the player.
- Enemy breaks away if it drifts too close to the player.
- Enemy does not repeatedly flip between “approach” and “hold range” every few frames.
- With `10+` enemies, they spread around the player instead of collapsing into one stack.
- With asteroids present, enemies visibly bias away from collision paths.
- After adding projectile threat perception, an enemy can dodge shots without rewriting the architecture.

Engineering checks:
- player and enemy both use the same locomotion code path
- AI decision tick is decoupled from frame rate
- movement remains deterministic enough for tuning/debugging
- new behaviors are added by adding considerations/tactics, not by rewriting a giant conditional block

## Assumptions and Defaults
- Start with **utility + steering** as the chosen architecture.
- Target scale is **10+ swarm**, so AI LOD and slot-based spacing are in scope from day one.
- Player remains the only combat target for v1.
- “Get behind player” is a tactical option, not a separate planner system.
- GOAP is intentionally deferred until the game has richer world interactions.
- `entities/` remains the folder for gameplay actors; add `src/entities/enemies/` and a new `src/ai/` for reusable AI logic.

References informing this recommendation:
- Craig Reynolds, *Steering Behaviors For Autonomous Characters*: https://www.red3d.com/cwr/steer/
- Unreal Engine Behavior Tree overview, useful as the comparison point for BT-style blackboard/task AI: https://dev.epicgames.com/documentation/en-us/unreal-engine/behavior-tree-in-unreal-engine---overview?application_version=5.6
- Dave Mark / Kevin Dill utility-AI summary, especially reusable “considerations”: https://www.gamedeveloper.com/business/video-embracing-the-dark-art-of-mathematical-modeling-in-ai
- Jeff Orkin GOAP resource page, as the “not yet” option for heavier planning: https://static.hlt.bme.hu/semantics/external/pages/GOAP/alumni.media.mit.edu/_jorkin/goap.html
