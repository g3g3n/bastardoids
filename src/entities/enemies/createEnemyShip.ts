import * as THREE from "three";
import type {
  EnemyPerceptionSnapshot,
  EnemyShipDefinition,
  EnemyShipEntity,
  PlayerShield,
  ShipThrusterRuntime,
  ShipLines,
} from "../../types";
import { getTotalShipMass } from "../ships/loadout";
import { createShipVisual } from "../../visuals/createShipVisual";

export interface CreatedEnemyShip {
  enemy: EnemyShipEntity;
  lines: ShipLines;
  shield: PlayerShield;
}

function createEmptyPerception(): EnemyPerceptionSnapshot {
  return {
    distanceToPlayer: Infinity,
    relativeBearing: 0,
    playerVelocity: new THREE.Vector3(),
    closestApproachPlayerDistance: Infinity,
    playerCollisionRadius: 0,
    nearestAsteroidThreatDistance: Infinity,
    nearestAsteroidThreatCollisionRadius: 0,
    nearestAsteroidThreatPosition: null,
    nearestProjectileThreatDistance: Infinity,
    nearestProjectileThreatPosition: null,
    nearestEnemySeparationDistance: Infinity,
    nearestEnemySeparationPosition: null,
    timeToCollisionPlayer: Infinity,
    timeToCollisionAsteroid: Infinity,
  };
}

function createEmptyThrusterState(): ShipThrusterRuntime {
  return {
    inputState: {
      forward: false,
      reverse: false,
      left: false,
      right: false,
    },
    holdTime: {
      forward: 0,
      reverse: 0,
      left: 0,
      right: 0,
    },
    emissionCarry: {
      forward: 0,
      reverse: 0,
      left: 0,
      right: 0,
    },
  };
}

export function createEnemyShip(
  definition: EnemyShipDefinition,
  nextId: number,
  position: THREE.Vector3,
): CreatedEnemyShip {
  const createdVisual = createShipVisual(
    definition.shipModel,
    definition.visualScale,
    definition.lineColor,
  );
  createdVisual.group.position.copy(position);

  const shieldGeometry = new THREE.SphereGeometry(definition.radius * 2.15, 14, 12);
  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: 0x69d8ff,
    transparent: true,
    opacity: 0.18,
    wireframe: true,
    depthWrite: false,
  });
  const shield = new THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>(
    shieldGeometry,
    shieldMaterial,
  );
  shield.visible = false;
  createdVisual.group.add(shield);

  const preferredRange =
    definition.preferredRangeMin +
    (definition.preferredRangeMax - definition.preferredRangeMin) * 0.5;
  const slotAngle = (nextId * 2.399963229728653) % (Math.PI * 2);

  const enemy: EnemyShipEntity = {
    id: nextId,
    type: "enemyShip",
    faction: "enemy",
    name: definition.name,
    mass: getTotalShipMass(definition),
    radius: definition.radius,
    vent: definition.vent,
    thermalCap: definition.thermalCap,
    heat: 0,
    maxHull: definition.maxHull,
    hull: definition.maxHull,
    maxShield: definition.shield,
    shield: definition.shield,
    shieldRegen: definition.shieldRegen,
    shieldRegenDelaySeconds: definition.shieldRegenDelaySeconds,
    shieldRegenCooldownUntil: 0,
    definition,
    mesh: createdVisual.group,
    position: position.clone(),
    velocity: new THREE.Vector3(),
    yaw: Math.PI / 2,
    yawVelocity: 0,
    alive: true,
    blackboard: {
      preferredRange,
      orbitDirection: nextId % 2 === 0 ? 1 : -1,
      slotAngle,
      currentTactic: "closeToRange",
      engaged: false,
      disengageAt: 0,
      decisionLockUntil: 0,
      nextDecisionAt: 0,
      nextPerceptionUpdateAt: 0,
      nextFireAt: 0,
      spawnPoint: position.clone(),
      perception: createEmptyPerception(),
      screenTracking: {
        hasBeenSeen: false,
        lastSeenAt: -Infinity,
      },
      debugInterceptDirection: new THREE.Vector3(0, 0, 1),
      debugHasInterceptPoint: false,
    },
    thrusterState: createEmptyThrusterState(),
  };
  enemy.mesh.rotation.y = enemy.yaw;

  return {
    enemy,
    lines: createdVisual.lines,
    shield,
  };
}
