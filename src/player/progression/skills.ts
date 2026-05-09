import type { PlayerSkillId, SkillDefinition } from "./types";

export const PLAYER_SKILL_DEFINITIONS = {
  thermalLattice: {
    id: "thermalLattice",
    name: "Thermal Lattice",
    kind: "passive",
    baseWeight: 1,
    tiers: [
      {
        description: "+9% thermal cap.",
        modifiers: { thermalCapPercent: 0.09 },
      },
      {
        description: "+9% more thermal cap.",
        modifiers: { thermalCapPercent: 0.09 },
      },
      {
        description: "+10% more thermal cap.",
        modifiers: { thermalCapPercent: 0.1 },
      },
    ],
  },
  ventingArray: {
    id: "ventingArray",
    name: "Venting Array",
    kind: "passive",
    baseWeight: 1,
    tiers: [
      {
        description: "+6% vent rate.",
        modifiers: { ventPercent: 0.06 },
      },
      {
        description: "+7% more vent rate.",
        modifiers: { ventPercent: 0.07 },
      },
      {
        description: "+7% more vent rate.",
        modifiers: { ventPercent: 0.07 },
      },
      {
        description: "+9% more vent rate.",
        modifiers: { ventPercent: 0.09 },
      },
    ],
  },
  rangefinder: {
    id: "rangefinder",
    name: "Rangefinder",
    kind: "passive",
    baseWeight: 1,
    tiers: [
      {
        description: "+8% weapon range.",
        modifiers: { weaponRangePercent: 0.08 },
      },
      {
        description: "+8% more weapon range.",
        modifiers: { weaponRangePercent: 0.08 },
      },
      {
        description: "+10% more weapon range.",
        modifiers: { weaponRangePercent: 0.1 },
      },
    ],
  },
  rapidCycling: {
    id: "rapidCycling",
    name: "Rapid Cycling",
    kind: "passive",
    baseWeight: 1,
    tiers: [
      {
        description: "+8% fire rate.",
        modifiers: { fireRatePercent: 0.08 },
      },
      {
        description: "+8% more fire rate.",
        modifiers: { fireRatePercent: 0.08 },
      },
      {
        description: "+10% more fire rate.",
        modifiers: { fireRatePercent: 0.1 },
      },
    ],
  },
  maneuveringJets: {
    id: "maneuveringJets",
    name: "Maneuvering Jets",
    kind: "passive",
    baseWeight: 1,
    tiers: [
      {
        description: "+7% thrust and strafe, +5% turn authority.",
        modifiers: {
          thrustPercent: 0.07,
          reverseThrustPercent: 0.07,
          strafeThrustPercent: 0.07,
          turnRatePercent: 0.05,
          turnDampingPercent: 0.05,
        },
      },
      {
        description: "+7% more thrust and strafe, +5% more turn authority.",
        modifiers: {
          thrustPercent: 0.07,
          reverseThrustPercent: 0.07,
          strafeThrustPercent: 0.07,
          turnRatePercent: 0.05,
          turnDampingPercent: 0.08,
        },
      },
      {
        description: "+8% more thrust and strafe, +6% more turn authority.",
        modifiers: {
          thrustPercent: 0.08,
          reverseThrustPercent: 0.08,
          strafeThrustPercent: 0.08,
          turnRatePercent: 0.06,
          turnDampingPercent: 0.06,
        },
      },
    ],
  },
  tacticalForecasting: {
    id: "tacticalForecasting",
    name: "Tactical Forecasting",
    kind: "passive",
    baseWeight: 0.75,
    tiers: [
      {
        description: "+1 level-up choice on future level-ups.",
        modifiers: { offerChoiceFlat: 1 },
      },
    ],
  },
  hotShots: {
    id: "hotShots",
    name: "Hot Shots",
    kind: "active",
    baseWeight: 0.9,
    defaultActiveKey: "KeyQ",
    tiers: [
      {
        description:
          "Active: for 2s, double fire rate and auto-fire weapon 1. Shots generate +10% heat.",
        activeEffect: {
          durationSeconds: 2,
          cooldownSeconds: 5,
          fireRateMultiplier: 2.2,
          heatMultiplier: 1.1,
          autoFire: true,
        },
      },
      {
        description:
          "Active: for 2.5s, fire rate x2.15 and auto-fire weapon 1. Shots generate +8% heat.",
        activeEffect: {
          durationSeconds: 2.5,
          cooldownSeconds: 5,
          fireRateMultiplier: 2.5,
          heatMultiplier: 1.08,
          autoFire: true,
        },
      },
      {
        description:
          "Active: for 3s, fire rate x2.3 and auto-fire weapon 1. Shots generate +6% heat.",
        activeEffect: {
          durationSeconds: 3,
          cooldownSeconds: 5,
          fireRateMultiplier: 2.7,
          heatMultiplier: 1.06,
          autoFire: true,
        },
      },
    ],
  },
  emergencyVent: {
    id: "emergencyVent",
    name: "Emergency Vent",
    kind: "active",
    baseWeight: 2.9,
    defaultActiveKey: "KeyV",
    tiers: [
      {
        description:
          "Active: vent 55% of thermal cap over 2.5s. Weapons, thrusters, and shields are disabled while venting.",
        activeEffect: {
          durationSeconds: 2.5,
          cooldownSeconds: 1,
          emergencyVentFractionOfThermalCap: 0.55,
          disableWeapons: true,
          disableThrusters: true,
          disableShield: true,
        },
      },
      {
        description:
          "Active: vent 58% of thermal cap over 2.6s. Weapons, thrusters, and shields are disabled while venting.",
        activeEffect: {
          durationSeconds: 2.6,
          cooldownSeconds: 1,
          emergencyVentFractionOfThermalCap: 0.58,
          disableWeapons: true,
          disableThrusters: true,
          disableShield: true,
        },
      },
      {
        description:
          "Active: vent 61% of thermal cap over 2.7s. Weapons, thrusters, and shields are disabled while venting.",
        activeEffect: {
          durationSeconds: 2.7,
          cooldownSeconds: 1,
          emergencyVentFractionOfThermalCap: 0.61,
          disableWeapons: true,
          disableThrusters: true,
          disableShield: true,
        },
      },
      {
        description:
          "Active: vent 64% of thermal cap over 2.8s. Weapons, thrusters, and shields are disabled while venting.",
        activeEffect: {
          durationSeconds: 2.8,
          cooldownSeconds: 1,
          emergencyVentFractionOfThermalCap: 0.64,
          disableWeapons: true,
          disableThrusters: true,
          disableShield: true,
        },
      },
      {
        description:
          "Active: vent 67% of thermal cap over 2.9s. Weapons, thrusters, and shields are disabled while venting.",
        activeEffect: {
          durationSeconds: 2.9,
          cooldownSeconds: 1,
          emergencyVentFractionOfThermalCap: 0.67,
          disableWeapons: true,
          disableThrusters: true,
          disableShield: true,
        },
      },
    ],
  },
} satisfies Record<PlayerSkillId, SkillDefinition>;

export function getPlayerSkillDefinition(skillId: PlayerSkillId): SkillDefinition {
  return PLAYER_SKILL_DEFINITIONS[skillId];
}

export function getAllPlayerSkills(): SkillDefinition[] {
  return Object.values(PLAYER_SKILL_DEFINITIONS);
}
