import type { EnemyShipDefinition, EnemyShipName } from "../../types";

const HUNTER_BASE_DEFINITION = {
  hullMass: 27,
  maxHull: 80,
  armor: 0,
  shield: 0,
  shieldRegen: 0,
  shieldRegenDelaySeconds: 2.5,
  radius: 5.7,
  vent: 20,
  thermalCap: 150,
  thrust: 750,
  reverseThrust: 600,
  strafeThrust: 400,
  maxSpeed: 28,
  strafeMaxSpeed: 14,
  shipModel: "ship5",
  visualScale: 1.73,
  turnRate: 3313.98,
  turnDamping: 1436.75,
  yawInertiaFactor: 1.0,
  speedCapCurveExponent: 1.3,
  enginePowerMw: 100,
  engageRadius: 350,
  preferredRangeMin: 20,
  preferredRangeMax: 80,
  decisionInterval: 0.12,
  farDecisionInterval: 0.34,
  aimToleranceDegrees: 12,
  avoidanceWeight: 1.45,
  orbitWeight: 1.0,
  behindWeight: 0.95,
  projectileAvoidanceWeight: 1.55,
  separationWeight: 0.8,
  tacticLockSeconds: 0.25,
  pursuitLoseSeconds: 8,
  returnHomeRadius: 20,
  xpReward: 8,
  scrapReward: 12,
  lineColor: 0xffb980,
} as const;

export const ENEMY_SHIP_DEFINITIONS = {
  "Hunter T": {
    ...HUNTER_BASE_DEFINITION,
    name: "Hunter T",
    weapon1: "kineticTorpedo",
    fireRadius: 170,
    orbitPreset: "wide"
  },
  "Hunter L": {
    ...HUNTER_BASE_DEFINITION,
    name: "Hunter L",
    weapon1: "laser",
    fireRadius: 130,
    orbitPreset: "balanced"
  },
  "Hunter P": {
    ...HUNTER_BASE_DEFINITION,
    name: "Hunter P",
    weapon1: "lightPlasmaCannon",
    fireRadius: 150,
    orbitPreset: "balanced"
  },
} satisfies Record<EnemyShipName, EnemyShipDefinition>;

export function getEnemyShipDefinition(name: EnemyShipName): EnemyShipDefinition {
  return ENEMY_SHIP_DEFINITIONS[name];
}
