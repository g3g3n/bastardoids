import type { EnemyShipDefinition, EnemyShipName } from "../../types";

export const ENEMY_SHIP_DEFINITIONS = {
  hunter: {
    name: "hunter",
    mass: 1,
    maxHealth: 8,
    radius: 3.9,
    thrust: 25,
    reverseThrust: 20,
    strafeThrust: 12,
    maxSpeed: 28,
    strafeMaxSpeed: 14,
    shipModel: "ship2",
    primaryWeapon: "kineticTorpedo",
    visualScale: 1.43,
    turnRate: 9,
    turnDamping: 4.6,
    muzzleOffsetForward: 3.64,
    muzzleOffsetSide: 1.5,
    engageRadius: 350,
    fireRadius: 200,
    preferredRangeMin: 50,
    preferredRangeMax: 90,
    decisionInterval: 0.14,
    farDecisionInterval: 0.34,
    aimToleranceDegrees: 12,
    avoidanceWeight: 1.45,
    orbitWeight: 1.2,
    behindWeight: 0.95,
    projectileAvoidanceWeight: 1.55,
    separationWeight: 0.8,
    tacticLockSeconds: 0.35,
    pursuitLoseSeconds: 5,
    returnHomeRadius: 20,
    scoreValue: 8,
    lineColor: 0xffb980,
  },
} satisfies Record<EnemyShipName, EnemyShipDefinition>;

export function getEnemyShipDefinition(name: EnemyShipName): EnemyShipDefinition {
  return ENEMY_SHIP_DEFINITIONS[name];
}
