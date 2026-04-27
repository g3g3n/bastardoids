import * as THREE from "three";
import { getWeaponDefinition } from "../entities/projectiles/weaponDefinitions";
import { getShipBasis, wrapAngle } from "../entities/ships/shipController";
import type {
  AsteroidEntity,
  EnemyPerceptionSnapshot,
  EnemyShipEntity,
  EnemyTactic,
  PlayerState,
  ProjectileEntity,
  ShipControlIntent,
} from "../types";

export interface EnemyAiContext {
  player: PlayerState | null;
  asteroids: Iterable<AsteroidEntity>;
  projectiles: Iterable<ProjectileEntity>;
  enemies: Iterable<EnemyShipEntity>;
  elapsed: number;
  delta: number;
}

const IDLE_INTENT: ShipControlIntent = {
  targetYaw: null,
  forwardThrottle: 0,
  reverseThrottle: 0,
  strafe: 0,
  useAfterburner: false,
  firePrimary: false,
};

export function updateEnemyAi(
  enemy: EnemyShipEntity,
  context: EnemyAiContext,
): ShipControlIntent {
  if (!context.player || !enemy.alive) {
    return IDLE_INTENT;
  }

  const definition = enemy.definition;
  const distanceToPlayer = planarDistance(enemy.position, context.player.position);
  const playerInDetectionRange = distanceToPlayer <= definition.engageRadius;
  if (playerInDetectionRange) {
    enemy.blackboard.engaged = true;
    enemy.blackboard.disengageAt = context.elapsed + definition.pursuitLoseSeconds;
  } else if (enemy.blackboard.engaged && context.elapsed >= enemy.blackboard.disengageAt) {
    enemy.blackboard.engaged = false;
  }

  const shouldPursuePlayer =
    playerInDetectionRange ||
    (enemy.blackboard.engaged && context.elapsed < enemy.blackboard.disengageAt);
  const decisionInterval =
    shouldPursuePlayer
      ? definition.decisionInterval
      : definition.farDecisionInterval;

  if (context.elapsed >= enemy.blackboard.nextPerceptionUpdateAt) {
    enemy.blackboard.perception = computeEnemyPerception(enemy, context);
    enemy.blackboard.nextPerceptionUpdateAt = context.elapsed + decisionInterval;
  }

  if (!shouldPursuePlayer) {
    const emergencyTactic = chooseEmergencyTactic(enemy, enemy.blackboard.perception);
    enemy.blackboard.currentTactic = emergencyTactic ?? "returnToSpawn";
    enemy.blackboard.nextDecisionAt = context.elapsed + decisionInterval;
  } else {
    const emergencyTactic = chooseEmergencyTactic(enemy, enemy.blackboard.perception);
    if (emergencyTactic) {
      enemy.blackboard.currentTactic = emergencyTactic;
      enemy.blackboard.decisionLockUntil = context.elapsed + definition.tacticLockSeconds * 0.75;
      enemy.blackboard.nextDecisionAt = context.elapsed + decisionInterval;
    } else if (context.elapsed >= enemy.blackboard.nextDecisionAt) {
      const nextTactic = chooseEnemyTactic(enemy, context.player, enemy.blackboard.perception);
      if (
        context.elapsed >= enemy.blackboard.decisionLockUntil ||
        nextTactic === enemy.blackboard.currentTactic
      ) {
        enemy.blackboard.currentTactic = nextTactic;
        enemy.blackboard.decisionLockUntil = context.elapsed + definition.tacticLockSeconds;
      }
      enemy.blackboard.nextDecisionAt = context.elapsed + decisionInterval;
    }
  }

  if (
    enemy.blackboard.currentTactic === "orbitLeft" ||
    enemy.blackboard.currentTactic === "orbitRight"
  ) {
    enemy.blackboard.slotAngle = wrapAngle(
      enemy.blackboard.slotAngle + enemy.blackboard.orbitDirection * context.delta * 0.55,
    );
  }

  return buildEnemyControlIntent(enemy, context);
}

function computeEnemyPerception(
  enemy: EnemyShipEntity,
  context: EnemyAiContext,
): EnemyPerceptionSnapshot {
  const player = context.player;
  if (!player) {
    return {
      distanceToPlayer: Infinity,
      relativeBearing: 0,
      playerVelocity: new THREE.Vector3(),
      predictedInterceptPoint: new THREE.Vector3(),
      nearestAsteroidThreatDistance: Infinity,
      nearestAsteroidThreatPosition: null,
      nearestProjectileThreatDistance: Infinity,
      nearestProjectileThreatPosition: null,
      nearestEnemySeparationDistance: Infinity,
      nearestEnemySeparationPosition: null,
      timeToCollisionPlayer: Infinity,
      timeToCollisionAsteroid: Infinity,
    };
  }

  const toPlayer = planarVector(enemy.position, player.position);
  const distanceToPlayer = toPlayer.length();
  const relativeBearing = wrapAngle(Math.atan2(toPlayer.x, toPlayer.z) - enemy.yaw);
  const weaponDefinition = getWeaponDefinition(enemy.definition.primaryWeapon);
  const predictedInterceptPoint =
    solveInterceptPoint(enemy.position, enemy.velocity, player.position, player.velocity, weaponDefinition.speed) ??
    player.position.clone();

  let nearestAsteroidThreatDistance = Infinity;
  let nearestAsteroidThreatPosition: THREE.Vector3 | null = null;
  let timeToCollisionAsteroid = Infinity;
  for (const asteroid of context.asteroids) {
    if (!asteroid.alive) {
      continue;
    }

    const approach = closestApproach(
      enemy.position,
      enemy.velocity,
      asteroid.position,
      asteroid.velocity,
      1.4,
    );
    if (approach.distance < nearestAsteroidThreatDistance) {
      nearestAsteroidThreatDistance = approach.distance;
      nearestAsteroidThreatPosition = asteroid.position.clone();
      timeToCollisionAsteroid = approach.time;
    }
  }

  let nearestProjectileThreatDistance = Infinity;
  let nearestProjectileThreatPosition: THREE.Vector3 | null = null;
  for (const projectile of context.projectiles) {
    if (!projectile.alive || projectile.faction === enemy.faction) {
      continue;
    }

    const approach = closestApproach(
      enemy.position,
      enemy.velocity,
      projectile.position,
      projectile.velocity,
      1.15,
    );
    if (approach.distance < nearestProjectileThreatDistance) {
      nearestProjectileThreatDistance = approach.distance;
      nearestProjectileThreatPosition = projectile.position.clone();
    }
  }

  let nearestEnemySeparationDistance = Infinity;
  let nearestEnemySeparationPosition: THREE.Vector3 | null = null;
  for (const otherEnemy of context.enemies) {
    if (!otherEnemy.alive || otherEnemy.id === enemy.id) {
      continue;
    }

    const separation = planarDistance(enemy.position, otherEnemy.position);
    if (separation < nearestEnemySeparationDistance) {
      nearestEnemySeparationDistance = separation;
      nearestEnemySeparationPosition = otherEnemy.position.clone();
    }
  }

  const playerApproach = closestApproach(
    enemy.position,
    enemy.velocity,
    player.position,
    player.velocity,
    1.1,
  );

  return {
    distanceToPlayer,
    relativeBearing,
    playerVelocity: player.velocity.clone(),
    predictedInterceptPoint,
    nearestAsteroidThreatDistance,
    nearestAsteroidThreatPosition,
    nearestProjectileThreatDistance,
    nearestProjectileThreatPosition,
    nearestEnemySeparationDistance,
    nearestEnemySeparationPosition,
    timeToCollisionPlayer: playerApproach.time,
    timeToCollisionAsteroid,
  };
}

function chooseEmergencyTactic(
  enemy: EnemyShipEntity,
  perception: EnemyPerceptionSnapshot,
): EnemyTactic | null {
  const projectileThreat =
    perception.nearestProjectileThreatDistance <
    enemy.radius + enemy.definition.radius * 6.5;
  if (projectileThreat) {
    return "dodgeProjectile";
  }

  const collisionThreat =
    perception.distanceToPlayer < enemy.blackboard.preferredRange * 0.55 ||
    perception.timeToCollisionPlayer < 0.75 ||
    perception.timeToCollisionAsteroid < 0.9;
  return collisionThreat ? "evadeCollision" : null;
}

function chooseEnemyTactic(
  enemy: EnemyShipEntity,
  player: PlayerState,
  perception: EnemyPerceptionSnapshot,
): EnemyTactic {
  const definition = enemy.definition;
  const minRange = definition.preferredRangeMin;
  const maxRange = definition.preferredRangeMax;
  const preferredMid = (minRange + maxRange) * 0.5;
  const distance = perception.distanceToPlayer;
  const tooClose = distance < minRange ? (minRange - distance) / Math.max(minRange, 1) : 0;
  const tooFar = distance > maxRange ? (distance - maxRange) / Math.max(maxRange, 1) : 0;
  const withinBand =
    distance >= minRange && distance <= maxRange
      ? 1
      : Math.max(0, 1 - Math.abs(distance - preferredMid) / Math.max(preferredMid, 1));

  const projectileThreat = clamp01(
    1 - perception.nearestProjectileThreatDistance / Math.max(enemy.radius * 8, 1),
  );
  const collisionThreat = Math.max(
    clamp01(1 - perception.timeToCollisionPlayer / 1.2),
    clamp01(1 - perception.timeToCollisionAsteroid / 1.0),
    clamp01(1 - perception.nearestEnemySeparationDistance / Math.max(enemy.radius * 8, 1)),
  );

  const playerForward = getShipBasis(player.yaw).forward;
  const playerToEnemy = planarVector(player.position, enemy.position).normalize();
  const behindAlignment = clamp01((1 - playerForward.dot(playerToEnemy)) * 0.5);

  const scores: Record<EnemyTactic, number> = {
    closeToRange: tooFar * 3.2,
    holdRange: withinBand * (1 - collisionThreat) * (1 - projectileThreat) * 1.05,
    orbitLeft:
      withinBand *
      definition.orbitWeight *
      (enemy.blackboard.orbitDirection > 0 ? 1.1 : 0.85),
    orbitRight:
      withinBand *
      definition.orbitWeight *
      (enemy.blackboard.orbitDirection < 0 ? 1.1 : 0.85),
    breakAway: tooClose * 3.4 + collisionThreat * 1.2,
    evadeCollision: collisionThreat * definition.avoidanceWeight * 2.8,
    dodgeProjectile: projectileThreat * definition.projectileAvoidanceWeight * 3.1,
    repositionBehind: withinBand * behindAlignment * definition.behindWeight * 1.8,
    returnToSpawn: 0,
  };

  let bestTactic: EnemyTactic = enemy.blackboard.currentTactic;
  let bestScore = -Infinity;
  for (const [tactic, score] of Object.entries(scores) as [EnemyTactic, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestTactic = tactic;
    }
  }

  return bestTactic;
}

function buildEnemyControlIntent(
  enemy: EnemyShipEntity,
  context: EnemyAiContext,
): ShipControlIntent {
  const player = context.player;
  if (!player) {
    return IDLE_INTENT;
  }

  const desiredMovement = getBaseTacticMovement(enemy, player, enemy.blackboard.currentTactic);
  desiredMovement.add(getAvoidanceVector(enemy, player, enemy.blackboard.perception));

  if (enemy.blackboard.currentTactic === "returnToSpawn") {
    const homeVector = planarVector(enemy.position, enemy.blackboard.spawnPoint);
    const { forward, right } = getShipBasis(enemy.yaw);
    if (homeVector.length() <= enemy.definition.returnHomeRadius) {
      const planarVelocity = enemy.velocity.clone().setY(0);
      if (planarVelocity.lengthSq() <= 1) {
        return {
          targetYaw: null,
          forwardThrottle: 0,
          reverseThrottle: 0,
          strafe: 0,
          useAfterburner: false,
          firePrimary: false,
        };
      }

      const brakeDirection = planarVelocity.multiplyScalar(-1).normalize();
      return {
        targetYaw: Math.atan2(brakeDirection.x, brakeDirection.z),
        forwardThrottle: 1,
        reverseThrottle: 0,
        strafe: 0,
        useAfterburner: false,
        firePrimary: false,
      };
    }

    const homeDirection = homeVector
      .add(desiredMovement)
      .addScaledVector(enemy.velocity, -0.9)
      .normalize();
    const targetYaw = Math.atan2(homeDirection.x, homeDirection.z);
    return {
      targetYaw,
      forwardThrottle: Math.max(0, homeDirection.dot(forward)),
      reverseThrottle: Math.max(0, -homeDirection.dot(forward)),
      strafe: THREE.MathUtils.clamp(homeDirection.dot(right), -1, 1),
      useAfterburner: false,
      firePrimary: false,
    };
  }

  const { forward, right } = getShipBasis(enemy.yaw);
  const desiredDirection =
    desiredMovement.lengthSq() > 0.0001 ? desiredMovement.normalize() : new THREE.Vector3();

  const aimPoint =
    enemy.blackboard.perception.distanceToPlayer <= enemy.definition.fireRadius
      ? enemy.blackboard.perception.predictedInterceptPoint
      : player.position;
  const targetYaw = Math.atan2(aimPoint.x - enemy.position.x, aimPoint.z - enemy.position.z);
  const yawError = Math.abs(wrapAngle(targetYaw - enemy.yaw));
  const weapon = getWeaponDefinition(enemy.definition.primaryWeapon);
  const canFire =
    context.elapsed >= enemy.blackboard.nextFireAt &&
    enemy.blackboard.perception.distanceToPlayer <= enemy.definition.fireRadius &&
    yawError <= THREE.MathUtils.degToRad(enemy.definition.aimToleranceDegrees) &&
    !hasAsteroidLineBlock(enemy.position, aimPoint, context.asteroids);

  const allowReverse =
    enemy.blackboard.currentTactic === "breakAway" ||
    enemy.blackboard.currentTactic === "evadeCollision";
  let forwardThrottle = Math.max(0, desiredDirection.dot(forward));
  let reverseThrottle = allowReverse ? Math.max(0, -desiredDirection.dot(forward)) : 0;
  let strafe = THREE.MathUtils.clamp(desiredDirection.dot(right), -1, 1);

  if (!allowReverse && reverseThrottle === 0 && desiredDirection.dot(forward) < -0.2) {
    const sidestepSign = Math.sign(wrapAngle(targetYaw - enemy.yaw)) || enemy.blackboard.orbitDirection;
    strafe = THREE.MathUtils.clamp(strafe + sidestepSign * Math.abs(desiredDirection.dot(forward)), -1, 1);
    forwardThrottle *= 0.35;
  }

  return {
    targetYaw,
    forwardThrottle,
    reverseThrottle,
    strafe,
    useAfterburner: false,
    firePrimary: canFire && weapon.shotsPerSecond > 0,
  };
}

function getBaseTacticMovement(
  enemy: EnemyShipEntity,
  player: PlayerState,
  tactic: EnemyTactic,
): THREE.Vector3 {
  const toPlayer = planarVector(enemy.position, player.position);
  const distance = Math.max(toPlayer.length(), 0.001);
  const radialToPlayer = toPlayer.clone().multiplyScalar(1 / distance);
  const awayFromPlayer = radialToPlayer.clone().multiplyScalar(-1);
  const leftTangent = new THREE.Vector3(-radialToPlayer.z, 0, radialToPlayer.x);
  const rightTangent = new THREE.Vector3(radialToPlayer.z, 0, -radialToPlayer.x);
  const tangent = enemy.blackboard.orbitDirection > 0 ? leftTangent : rightTangent;
  const preferredRange = enemy.blackboard.preferredRange;
  const radialError = distance - preferredRange;
  const radialCorrection = THREE.MathUtils.clamp(radialError / Math.max(preferredRange, 1), -1, 1);
  const desired = new THREE.Vector3();

  if (tactic === "closeToRange") {
    desired.copy(radialToPlayer).multiplyScalar(1.15).addScaledVector(tangent, 0.01);
  } else if (tactic === "holdRange") {
    desired
      .copy(tangent)
      .multiplyScalar(0.85)
      .addScaledVector(radialToPlayer, Math.max(radialCorrection, 0) * 0.65)
      .addScaledVector(awayFromPlayer, Math.max(-radialCorrection, 0) * 0.65);
  } else if (tactic === "orbitLeft" || tactic === "orbitRight") {
    const orbitTangent = tactic === "orbitLeft" ? leftTangent : rightTangent;
    desired
      .copy(orbitTangent)
      .multiplyScalar(1.15)
      .addScaledVector(radialToPlayer, Math.max(radialCorrection, 0) * 0.55)
      .addScaledVector(awayFromPlayer, Math.max(-radialCorrection, 0) * 0.55);
  } else if (tactic === "breakAway") {
    desired.copy(awayFromPlayer).multiplyScalar(1.2).addScaledVector(tangent, 0.35);
  } else if (tactic === "evadeCollision") {
    desired.copy(awayFromPlayer).multiplyScalar(1.5).addScaledVector(tangent, 0.45);
  } else if (tactic === "dodgeProjectile") {
    desired.copy(tangent).multiplyScalar(1.35).addScaledVector(awayFromPlayer, 0.5);
  } else if (tactic === "repositionBehind") {
    const playerForward = getShipBasis(player.yaw).forward;
    const behindTarget = player.position
      .clone()
      .addScaledVector(playerForward, -preferredRange)
      .addScaledVector(tangent, 10);
    desired.copy(planarVector(enemy.position, behindTarget));
  } else if (tactic === "returnToSpawn") {
    desired
      .copy(planarVector(enemy.position, enemy.blackboard.spawnPoint))
      .addScaledVector(enemy.velocity, -0.8);
  }

  return desired;
}

function getAvoidanceVector(
  enemy: EnemyShipEntity,
  player: PlayerState,
  perception: EnemyPerceptionSnapshot,
): THREE.Vector3 {
  const desired = new THREE.Vector3();
  const definition = enemy.definition;

  if (perception.nearestAsteroidThreatPosition) {
    desired.addScaledVector(
      getRepulsionVector(enemy.position, perception.nearestAsteroidThreatPosition, 90),
      definition.avoidanceWeight,
    );
  }

  if (perception.nearestProjectileThreatPosition) {
    desired.addScaledVector(
      getRepulsionVector(enemy.position, perception.nearestProjectileThreatPosition, 75),
      definition.projectileAvoidanceWeight,
    );
  }

  if (perception.nearestEnemySeparationPosition) {
    desired.addScaledVector(
      getRepulsionVector(enemy.position, perception.nearestEnemySeparationPosition, 55),
      definition.separationWeight,
    );
  }

  if (perception.distanceToPlayer < definition.preferredRangeMin * 0.9) {
    desired.addScaledVector(
      getRepulsionVector(enemy.position, player.position, definition.preferredRangeMin * 1.2),
      definition.avoidanceWeight * 1.2,
    );
  }

  return desired;
}

function getRepulsionVector(
  from: THREE.Vector3,
  threat: THREE.Vector3,
  influenceRadius: number,
): THREE.Vector3 {
  const offset = planarVector(threat, from);
  const distance = offset.length();
  if (distance <= 0.001 || distance >= influenceRadius) {
    return new THREE.Vector3();
  }

  const strength = 1 - distance / influenceRadius;
  return offset.normalize().multiplyScalar(strength);
}

function hasAsteroidLineBlock(
  from: THREE.Vector3,
  to: THREE.Vector3,
  asteroids: Iterable<AsteroidEntity>,
): boolean {
  const segment = planarVector(from, to);
  const segmentLengthSq = segment.lengthSq();
  if (segmentLengthSq <= 0.001) {
    return false;
  }

  for (const asteroid of asteroids) {
    if (!asteroid.alive) {
      continue;
    }

    const toAsteroid = planarVector(from, asteroid.position);
    const projection = THREE.MathUtils.clamp(toAsteroid.dot(segment) / segmentLengthSq, 0, 1);
    const closestPoint = from.clone().addScaledVector(segment, projection);
    const distanceToLine = planarDistance(closestPoint, asteroid.position);
    if (distanceToLine <= asteroid.radius + 2) {
      return true;
    }
  }

  return false;
}

function solveInterceptPoint(
  shooterPosition: THREE.Vector3,
  shooterVelocity: THREE.Vector3,
  targetPosition: THREE.Vector3,
  targetVelocity: THREE.Vector3,
  projectileSpeed: number,
): THREE.Vector3 | null {
  const relativePosition = planarVector(shooterPosition, targetPosition);
  const planarShooterVelocity = shooterVelocity.clone().setY(0);
  const planarTargetVelocity = targetVelocity.clone().setY(0);
  const relativeTargetVelocity = planarTargetVelocity.clone().sub(planarShooterVelocity);
  const a = relativeTargetVelocity.lengthSq() - projectileSpeed * projectileSpeed;
  const b = 2 * relativePosition.dot(relativeTargetVelocity);
  const c = relativePosition.lengthSq();

  let time = 0;
  if (Math.abs(a) < 0.0001) {
    if (Math.abs(b) < 0.0001) {
      return targetPosition.clone();
    }
    time = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
      return null;
    }
    const root = Math.sqrt(discriminant);
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    time = Math.min(t1 > 0 ? t1 : Infinity, t2 > 0 ? t2 : Infinity);
  }

  if (!Number.isFinite(time) || time < 0) {
    return null;
  }

  return targetPosition.clone().addScaledVector(planarTargetVelocity, time);
}

function closestApproach(
  originA: THREE.Vector3,
  velocityA: THREE.Vector3,
  originB: THREE.Vector3,
  velocityB: THREE.Vector3,
  horizonSeconds: number,
): { distance: number; time: number } {
  const relativePosition = planarVector(originA, originB);
  const relativeVelocity = velocityB.clone().setY(0).sub(velocityA.clone().setY(0));
  const speedSq = relativeVelocity.lengthSq();
  if (speedSq <= 0.0001) {
    return { distance: relativePosition.length(), time: Infinity };
  }

  const closingDot = relativePosition.dot(relativeVelocity);
  if (closingDot >= 0) {
    return { distance: relativePosition.length(), time: Infinity };
  }

  const projectedTime = THREE.MathUtils.clamp(
    -closingDot / speedSq,
    0,
    horizonSeconds,
  );
  const closestOffset = relativePosition.addScaledVector(relativeVelocity, projectedTime);
  return {
    distance: closestOffset.length(),
    time: projectedTime,
  };
}

function planarVector(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
}

function planarDistance(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}
