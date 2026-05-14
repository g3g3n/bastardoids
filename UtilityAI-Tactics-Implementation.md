# UtilityAI Tactics Implementation

This document describes the current enemy AI implementation in:

- `src/ai/enemyShipAi.ts`
- `src/entities/enemies/createEnemyShip.ts`
- `src/entities/enemies/enemyDefinitions.ts`
- `src/entities/ships/shipController.ts`
- `src/systems/CombatSystem.ts`
- `src/main.ts`

It is an implementation note, not a design goal document. The point is to capture how the AI works today, including behaviors that may be accidental or only lightly tuned.

## High-Level Model

The enemy AI is a lightweight utility-style selector wrapped around a persistent blackboard.

It is not a behavior tree and it is not a classic finite state machine. The current structure is closer to:

1. Update perception on a timer.
2. Apply a few hard-priority emergency checks.
3. Otherwise score all tactics with simple weighted formulas.
4. Keep the chosen tactic on the blackboard for a short lock period.
5. Convert the tactic into a desired movement vector.
6. Convert the desired movement vector plus aiming into ship control inputs.

So in practice this is a hybrid of:

- utility scoring for tactic choice
- blackboard state for persistence
- steering-vector blending for locomotion

## Update Flow Per Enemy

`updateEnemyAi(enemy, context)` runs once per gameplay update and does the following:

1. Early-out to idle if there is no player or the enemy is dead.
2. Compute whether the player is inside `engageRadius`.
3. Maintain an `engaged` memory flag and `disengageAt` timeout so the ship keeps pursuing briefly after the player leaves direct detection range.
4. Update perception only when `elapsed >= nextPerceptionUpdateAt`.
5. Update `orbitDirection` from the player's current tangential motion around the enemy.
6. Handle `commitAttack` completion and clear its state when its timer/heat condition ends.
7. Handle `flyBy` completion and clear its state when the destination is reached.
8. Choose the tactic:
   - if `commitAttackActive`, keep `commitAttack` and skip all other overrides
   - else if `flyByActive`, keep `flyBy` unless asteroid collision risk overrides it
   - else if not pursuing the player, use an emergency tactic if needed, otherwise `returnToSpawn`
   - else if pursuing the player, check emergency tactics first, otherwise run the utility selector when `elapsed >= nextDecisionAt`
9. Build a `ShipControlIntent`.

`main.ts` then:

1. calls `applyShipControl(...)`
2. performs a second post-turn aim check
3. fires the weapon if the intent still passes the final aim gate

That last step matters: AI chooses intent first, ship rotation happens second, and actual projectile spawning happens third.

## Blackboard State

Each enemy keeps the following AI state on `enemy.blackboard`:

- `preferredRange`
  Midpoint of `preferredRangeMin` and `preferredRangeMax`, computed once at spawn.
- `orbitDirection`
  Either `1` or `-1`. Used by several tactics to choose a default tangent side.
- `commitAttackActive`
  Whether a commit-attack firing posture is currently active.
- `commitAttackUntil`
  Time when the current commit-attack window ends.
- `flyByActive`
  Whether a fly-by run is in progress.
- `flyByDestination`
  The fixed world-space destination used by `flyBy`.
- `currentTactic`
  The tactic currently driving movement.
- `engaged`
  Whether the enemy is currently in its pursuit memory window.
- `disengageAt`
  Time when pursuit memory expires.
- `decisionLockUntil`
  Time until a normal tactic switch is allowed.
- `nextDecisionAt`
  Next time utility selection may run.
- `nextPerceptionUpdateAt`
  Next time perception will be recomputed.
- `nextFireAt`
  Per-enemy fire cooldown timestamp.
- `spawnPoint`
  Home location used by `returnToSpawn`.
- `perception`
  Cached `EnemyPerceptionSnapshot`.
- `debugInterceptDirection`
  Final aim direction currently shown by the debug intercept line.
- `debugHasInterceptPoint`
  Whether the debug line should be drawn.

## Perception Snapshot

Perception is currently planar. All meaningful AI calculations ignore `y`.

The snapshot contains:

- `distanceToPlayer`
- `closestApproachPlayerDistance`
- `playerCollisionRadius`
- `nearestAsteroidThreatDistance`
- `nearestAsteroidThreatCollisionRadius`
- `nearestAsteroidThreatPosition`
- `nearestProjectileThreatDistance`
- `nearestProjectileThreatPosition`
- `nearestEnemySeparationDistance`
- `nearestEnemySeparationPosition`
- `timeToCollisionPlayer`
- `timeToCollisionAsteroid`

Important detail: `timeToCollisionPlayer` and `timeToCollisionAsteroid` are derived from `closestApproach(...)`. They are times to closest approach within a finite horizon, not exact continuous collision times. The current code now also checks closest-approach distance against a collision radius plus buffer before treating them as true collision threats.

## Perception Cadence And Pursuit Memory

Enemy perception does not update every frame by default. It updates on a timer:

- `decisionInterval` while pursuing the player
- `farDecisionInterval` while not pursuing the player

Pursuit itself uses a simple memory rule:

- entering `engageRadius` sets `engaged = true`
- `disengageAt = elapsed + pursuitLoseSeconds`
- once outside engage radius, the enemy continues to pursue until `elapsed >= disengageAt`

That means the AI often acts on slightly stale cached perception, by design.

## Utility AI Selection

The current system is utility-style, but simple. It does not use curves or compensation factors. It just computes one score per tactic and picks the maximum.

### Range Terms

The selector first derives:

- `minRange = preferredRangeMin`
- `maxRange = preferredRangeMax`
- `preferredMid = (minRange + maxRange) * 0.5`
- `tooClose`
- `tooFar`
- `withinBand`

`withinBand` is:

- `1` if the player is inside `[minRange, maxRange]`
- otherwise a linear falloff based on distance from the midpoint

### Threat Terms

It also computes:

- `projectileThreat`
  From nearest hostile projectile distance
- `collisionThreat`
  Max of:
  - player closest-approach threat
  - asteroid closest-approach threat
  - enemy separation pressure

### Behind Alignment

`repositionBehind` uses:

- player forward vector
- normalized vector from player to enemy
- `behindAlignment = clamp01((1 - dot(playerForward, playerToEnemy)) * 0.5)`

So `behindAlignment` is strongest when the enemy is behind the player's facing direction.

### Current Tactic Scores

The current score table is:

```ts
closeToRange: tooFar * 3.2
holdRange: withinBand * (1 - collisionThreat) * (1 - projectileThreat) * 1.05
orbitLeft: withinBand * orbitWeight * (orbitDirection > 0 ? 1.1 : 0.85)
orbitRight: withinBand * orbitWeight * (orbitDirection < 0 ? 1.1 : 0.85)
commitAttack: canActivateCommitAttack(...) ? commitAttackHeatScore + commitAttackLateralScore : 0
flyBy: canActivateFlyByTactic(...) ? (1 - collisionThreat * 0.5) * 1.6 : 0
breakAway: tooClose * 3.4 + collisionThreat * 1.2
evadePlayerCollision: 0
evadeObjectCollision: collisionThreat * avoidanceWeight * 2.8
dodgeProjectile: projectileThreat * projectileAvoidanceWeight * 3.1
repositionBehind: withinBand * behindAlignment * behindWeight * 1.8
returnToSpawn: 0
```

Important consequences:

- `evadePlayerCollision` is not a normal utility choice. It is only entered through the emergency path.
- `evadeObjectCollision` and `dodgeProjectile` can be reached both as emergency tactics and as high-scoring normal tactics.
- `commitAttack` is a normal utility choice, but once active it temporarily bypasses all other tactic overrides, including the emergency path.
- `returnToSpawn` is not utility-selected during pursuit. It is used when the enemy is no longer pursuing the player and no emergency tactic is active.

## Emergency Tactics

Emergency tactics run before normal utility selection.

### Projectile Threat

If:

- `nearestProjectileThreatDistance < enemy.radius + enemy.definition.radius * 6.5`

then the enemy immediately chooses:

- `dodgeProjectile`

### Object Collision Threat

If either of these is true:

- asteroid closest-approach risk and `timeToCollisionAsteroid < 1.7`
- another enemy is within `enemy.radius * 3.25`

then the enemy immediately chooses:

- `evadeObjectCollision`

### Player Collision Threat

If either of these is true:

- `distanceToPlayer < preferredRange * 0.50`
- `timeToCollisionPlayer < 0.65` and the closest-approach distance is inside collision radius + buffer

then the enemy immediately chooses:

- `evadePlayerCollision`

## Tactic Locking

The AI does not freely switch tactics every frame.

- emergency tactic switches lock for `tacticLockSeconds * 0.75`
- normal tactic switches lock for `tacticLockSeconds`
- normal tactic choice only re-runs at `nextDecisionAt`

This means the selector is not stateless. It remembers the previous tactic and only swaps when timing allows.

## Steering Model

Enemy movement is local steering, not pathfinding.

There is no navmesh, waypoint graph, or route planner. Movement is built from vectors on the XZ plane.

The control pipeline is:

1. `getBaseTacticMovement(...)` returns a desired movement vector for the current tactic.
2. `getAvoidanceVector(...)` adds repulsion from hazards and local spacing pressure.
3. The sum is normalized into `desiredDirection`.
4. `desiredDirection` is projected onto the ship's local `forward` and `right` axes.
5. Those projections become `forwardThrottle`, `reverseThrottle`, and `strafe`.
6. `applyShipControl(...)` converts those inputs into mass-based thrust along forward, reverse, and strafe axes plus yaw acceleration toward `targetYaw`.

### Avoidance Vector

`getAvoidanceVector(...)` adds repulsion from:

- nearest asteroid threat within influence radius `90`
- nearest hostile projectile threat within influence radius `75`
- nearest enemy separation threat within influence radius `55`
- the player if the enemy is closer than `preferredRangeMin * 0.9`

The resulting vector is scaled by weights from the enemy definition:

- `avoidanceWeight`
- `projectileAvoidanceWeight`
- `separationWeight`

Special case:

- if the current tactic is `flyBy`, avoidance returns zero

That is deliberate. While in `flyBy`, the ship ignores general avoidance blending and only allows asteroid collision risk to interrupt the tactic through the higher-level override path.

### Generic Sidestep Logic

After the desired direction is computed, most tactics pass through one more movement rule:

- reverse thrust is only allowed for:
  - `closeToRange`
  - `repositionBehind`
  - `breakAway`
  - `evadePlayerCollision`
  - `evadeObjectCollision` when the threat is not behind the enemy

If reverse is not allowed and `desiredDirection` points significantly behind the ship's current forward axis:

- extra strafe is added toward the side indicated by the sign of `targetYaw - enemy.yaw`
- `forwardThrottle` is reduced to `35%`

In code this happens when:

- `desiredDirection.dot(forward) < -0.2`

This is one of the main sources of tangential motion in non-reversing tactics. It affects `holdRange`, `orbitLeft`, and `orbitRight` whenever the desired movement point falls behind the current nose.

## Aiming And Firing

Movement steering and weapon aiming are related, but not identical.

- movement comes from `desiredDirection`
- aiming comes from `aimPoint`
- `targetYaw` is always derived from the `aimPoint` for combat tactics

That means the ship turns its nose toward where it wants to shoot, while translational thrust is derived from the tactic movement vector.

### Aim Point Solver

If the enemy has a weapon, the AI calls:

- `solveAimPoint(shooterPosition, shooterVelocity, targetPosition, targetVelocity, weapon)`

`solveAimPoint(...)` works in two stages:

1. Try `solveInterceptPoint(...)` for an exact intercept inside the projectile's lifetime.
2. If no exact intercept exists, sample the projectile lifetime and choose the time whose travel-distance error is smallest.

So the AI always tries to use a lead solution, even when there is no mathematically exact intercept within weapon lifetime.

The aim solver inputs are live state values passed from `buildEnemyControlIntent(...)`, including the current `player.position` and `player.velocity`. It does not read player velocity from the cached perception snapshot.

### Exact Intercept Solver

`solveInterceptPoint(...)` is planar and relative.

It uses:

- `relativePosition = targetPosition - shooterPosition`
- `relativeTargetVelocity = targetVelocity - shooterVelocity`

Then it:

1. samples `48` times across `weapon.lifetimeSeconds`
2. finds the first sample where projectile travel distance catches up to target relative distance
3. refines that bracket with `10` binary-search steps
4. returns the target's projected future position at the refined intercept time

### Projectile Travel Curve

The solver does not assume constant projectile speed.

`getProjectileTravelDistanceAtTime(...)` supports:

- `initialSpeed`
- `initialSpeedDuration`
- `thrust`
- final `speed`

The travel model is piecewise:

1. constant speed at `initialSpeed`
2. acceleration at `thrust`
3. capped cruise at `speed`

If a weapon does not define staged propulsion, travel distance is effectively:

- `speed * time`

### Lead Factor

After the solver returns a point, the AI does not always use it directly.

Current implementation:

```ts
let leadFactor = 1.0;

if (weapon.name !== "kineticTorpedo") {
  if (currentTactic === "orbitLeft" || currentTactic === "orbitRight") {
    leadFactor = 1.0;
  } else if (currentTactic === "holdRange") {
    leadFactor = 1.0;
  }
}

aimPoint = lerp(player.position, fullLeadPoint, leadFactor);
```

Important implications:

- default aim is currently `1.0`
- current non-torpedo orbit and hold-range tactics do not apply additional dampening
- `kineticTorpedo` also currently uses `1.0`

The debug intercept line also uses this final post-factor aim direction, not the raw exact intercept.

### Fire Gates

The AI only sets `firePrimary = true` if all of these pass:

- weapon exists
- `elapsed >= nextFireAt`
- player is within `fireRadius`
- yaw error to `targetYaw` is within `aimToleranceDegrees`
- `hasLineBlock(...)` is false

`hasLineBlock(...)` blocks shots if the line from enemy to player is intersected by:

- an asteroid
- another enemy ship

### Second Aim Gate In `main.ts`

There is also a second aim gate after ship rotation is applied for the frame.

`main.ts` checks again that:

- `intent.firePrimary` is true
- `intent.targetYaw !== null`
- current post-turn yaw error is still within `aimToleranceDegrees`

Only then does it call `combat.fireShipPrimaryWeapon(...)`.

So actual firing is gated twice:

1. once in AI intent construction
2. once after ship turning has been applied

## Tactic-By-Tactic Behavior

### `closeToRange`

Purpose:

- move inward when the player is outside the preferred range band

Current movement:

```ts
desired = radialToPlayer * 1.25 + tangent * 0.01
```

Notes:

- this is mostly a direct approach
- it contains a tiny explicit tangential bias of `0.01`
- reverse thrust is allowed

### `holdRange`

Purpose:

- stay in the preferred band while keeping some lateral motion

Current movement:

```ts
desired =
  tangent * 0.85
  + radialToPlayer * max(radialCorrection, 0) * 0.65
  + awayFromPlayer * max(-radialCorrection, 0) * 0.65
```

Notes:

- this is a soft range-keeping orbit
- it currently uses the full solved lead factor of `1.0`

### `orbitLeft`

Purpose:

- circle counter-clockwise around the player while correcting range

Current movement:

```ts
desired =
  leftTangent * orbitPreset.tangentWeight
  + inward radial correction
  + outward radial correction
```

Notes:

- uses the enemy's `orbitPreset`
- it currently uses the full solved lead factor of `1.0`

### `orbitRight`

Purpose:

- circle clockwise around the player while correcting range

Current movement:

Same as `orbitLeft`, but using `rightTangent`.

### `commitAttack`

Purpose:

- stop translating, turn directly onto the current intercept line, and keep firing while heat and the commit window last

Activation requirements:

- player distance is at most `preferredRangeMax`
- relative lateral speed to player is at most `15`
- current yaw error to the intercept aim point is at most `35` degrees
- the enemy has enough predicted free heat to take the next shot without interruption

Current score shape:

- a heat term based on available heat percentage
- a lateral-speed term that rises as relative lateral speed approaches `0`

The current implementation uses:

- `availableHeatFraction * 100 * 0.05`
- `clamp01(1 - relativeLateralSpeed / 15) * 1.25`

Persistence:

- once active, `commitAttack` ignores all other tactic overrides, including emergency/evasion tactics
- it ends only when either:
  - `2.5` seconds have passed
  - the enemy no longer has enough predicted free heat to take the next shot without interruption

Movement:

- `forwardThrottle = 0`
- `reverseThrottle = 0`
- `strafe = 0`
- the ship only turns toward the current intercept-based `aimPoint`

Firing:

- it still uses the normal firing gates for alignment, cooldown, line block, and fire radius

### `flyBy`

Purpose:

- commit to a one-pass run through a point behind and slightly to the side of the player

Activation requirements:

- `weapon1 !== null`
- player distance is between `preferredRangeMax * 0.80` and `preferredRangeMax * 1.25`
- forward speed is at most `20%` of max speed
- relative lateral speed to player is at most `12`

On activation:

- `flyByActive = true`
- `flyByDestination = player.position - player.forward * 120 +/- player.right * 15`

Persistence:

- while active, the tactic remains `flyBy`
- only asteroid collision risk can override it to `evadeObjectCollision`
- player collision threat does not override it

Completion:

- the tactic ends when the enemy gets within `30` units of the stored destination

Movement:

- uses the vector from enemy to the fixed destination
- uses a special movement decomposition that keeps movement toward the destination while allowing the nose to keep turning toward the aim point

### `breakAway`

Purpose:

- create immediate distance when too close

Current movement:

```ts
desired = awayFromPlayer * 1.2 + tangent * 0.35
```

Notes:

- reverse thrust is allowed

### `evadePlayerCollision`

Purpose:

- emergency escape from imminent player collision

Current movement:

```ts
desired = awayFromPlayer * 1.5 + tangent * 0.45
```

Notes:

- reverse thrust is allowed
- this tactic only comes from emergency logic, not utility scoring

### `evadeObjectCollision`

Purpose:

- emergency or high-priority avoidance of asteroid or enemy-ship collision pressure

Current movement:

- if a concrete threat position is available:
  - move away from the threat plus a tangent around it
- otherwise:
  - move away from the player plus the default tangent

Notes:

- reverse thrust is allowed only when the threatening object is not behind the enemy

### `dodgeProjectile`

Purpose:

- lateral dodge against nearby hostile projectiles

Current movement:

```ts
desired = tangent * 1.35 + awayFromPlayer * 0.5
```

### `repositionBehind`

Purpose:

- move to a point behind the player's facing direction

Current movement:

```ts
behindTarget = player.position - playerForward * preferredRange + tangent * 10
desired = enemy -> behindTarget
```

Notes:

- this does not aim at the exact point directly behind the player
- it aims at a slightly offset rear-quarter point because of `tangent * 10`
- reverse thrust is allowed

### `returnToSpawn`

Purpose:

- return to the original spawn point when the player is no longer being pursued

Behavior:

- if already inside `returnHomeRadius`, brake against current planar velocity
- otherwise move toward `spawnPoint`, blended with `desiredMovement` and a velocity-damping term
- never fires

## Where Tangential Movement Comes From In `closeToRange` And `repositionBehind`

This is the part you explicitly asked to have spelled out.

### `closeToRange`

Tangential movement comes from one explicit place:

1. **Explicit tactic-level bias**

   `closeToRange` adds:

   - `tangent * 0.01`

   This is a very small sideways nudge added even during a nominally direct chase.

### `repositionBehind`

Tangential movement comes from one explicit place:

1. **Explicit tactic-level destination offset**

   The target point is:

   - behind the player by `preferredRange`
   - offset sideways by `tangent * 10`

   So the ship is not trying to sit on the player's exact six o'clock. It is trying to reach a rear-quarter point.

### Why These Tangential Pieces Exist

The code does not contain comments explaining intent, so this part is an inference.

Most likely purposes:

- avoid perfectly head-on or perfectly collinear chase paths
- reduce direct collision pressure
- avoid deadlocks where ships try to occupy the same line
- make rear-positioning choose one side instead of the exact centerline

But the important implementation fact is simpler:

- `closeToRange` is not purely radial
- `repositionBehind` is not purely "go straight behind the player"

## Orbit Direction And Orbit Presets

`orbitDirection` is updated continuously from the player's relative tangential motion around the enemy.

The AI computes:

- vector from enemy to player
- tangent axis around that vector
- player velocity relative to enemy velocity
- dot product onto the tangent axis

Then:

- if tangential speed > `1`, set `orbitDirection = -1`
- if tangential speed < `-1`, set `orbitDirection = 1`

This `orbitDirection` is used by:

- orbit tactic score preference
- default tangent choice in `closeToRange`
- `holdRange`
- `breakAway`
- `evadePlayerCollision`
- fallback `evadeObjectCollision`
- `dodgeProjectile`
- `repositionBehind`
- fly-by side selection

Current orbit presets:

- `aggressive`
  - tangent `1.35`
  - inward correction `0.75`
  - outward correction `0.45`
- `balanced`
  - tangent `1.15`
  - inward correction `0.55`
  - outward correction `0.55`
- `wide`
  - tangent `0.90`
  - inward correction `0.35`
  - outward correction `0.70`

Current ship assignments:

- `Hunter T`: `wide`
- `Hunter L`: `balanced`
- `Hunter P`: `balanced`

## Current Hunter AI Tuning

All current Hunter variants share the same base AI tuning except weapon and orbit preset:

- `engageRadius = 350`
- `fireRadius = 170`
- `preferredRangeMin = 20`
- `preferredRangeMax = 80`
- `decisionInterval = 0.12`
- `farDecisionInterval = 0.34`
- `aimToleranceDegrees = 12`
- `avoidanceWeight = 1.45`
- `orbitWeight = 1.0`
- `behindWeight = 0.95`
- `projectileAvoidanceWeight = 1.55`
- `separationWeight = 0.8`
- `tacticLockSeconds = 0.25`
- `pursuitLoseSeconds = 8`

That means current enemies differ mainly by:

- weapon
- orbit preset

not by a distinct pilot profile yet.

## Implementation Notes

- The AI is fully planar. `y` is stripped from almost every steering and intercept calculation.
- `useAfterburner` is always `false` for enemy AI right now.
- `preferredRange` on the blackboard is fixed at spawn to the midpoint of the range band.
- The debug intercept line shows the final aim direction after lead-factor blending, not the raw solver output.
- The current default `leadFactor` is `1.1`, so many tactics intentionally aim somewhat beyond the raw solver point.
