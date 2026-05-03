import type { EnemyShipDefinition, EnemyShipName } from "../../types";

export const ENEMY_SHIP_DEFINITIONS = {
  hunter: {
    name: "hunter",
    mass: 1,
    maxHull: 80,
    shield: 0,
    shieldRegen: 0,
    shieldRegenDelaySeconds: 2.5,
    radius: 5.7,
    vent: 20,
    thermalCap: 150,
    thrust: 25,
    reverseThrust: 20,
    strafeThrust: 12,
    maxSpeed: 28,
    strafeMaxSpeed: 14,
    shipModel: "ship5",
    primaryWeapon: "kineticTorpedo",
    visualScale: 1.73,
    turnRate: 3.4,
    turnDamping: 2.5,
    muzzleOffsetForward: 3.64,
    muzzleOffsetSide: 2.6,
    engageRadius: 350,
    fireRadius: 180,
    preferredRangeMin: 20,
    preferredRangeMax: 80,
    decisionInterval: 0.12,
    farDecisionInterval: 0.34,
    aimToleranceDegrees: 10,
    avoidanceWeight: 1.45,
    orbitWeight: 1.0,
    behindWeight: 0.95,
    projectileAvoidanceWeight: 1.55,
    separationWeight: 0.8,
    tacticLockSeconds: 0.25,
    pursuitLoseSeconds: 8,
    returnHomeRadius: 20,
    scoreValue: 8,
    lineColor: 0xffb980,
  },
} satisfies Record<EnemyShipName, EnemyShipDefinition>;

export function getEnemyShipDefinition(name: EnemyShipName): EnemyShipDefinition {
  return ENEMY_SHIP_DEFINITIONS[name];
}
