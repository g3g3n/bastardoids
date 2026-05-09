import type { PlayerConfig } from "../../types";

export type PlayerSkillId =
  | "thermalLattice"
  | "ventingArray"
  | "rangefinder"
  | "rapidCycling"
  | "maneuveringJets"
  | "tacticalForecasting"
  | "hotShots"
  | "emergencyVent";

export type PlayerSkillKind = "passive" | "active";
export type ActiveSkillKey = "KeyQ" | "KeyE" | "KeyR" | "KeyF" | "KeyV";

export interface SkillModifiers {
  thermalCapFlat?: number;
  thermalCapPercent?: number;
  ventPercent?: number;
  fireRatePercent?: number;
  weaponRangePercent?: number;
  weaponHeatPercent?: number;
  thrustPercent?: number;
  reverseThrustPercent?: number;
  strafeThrustPercent?: number;
  turnRatePercent?: number;
  turnDampingPercent?: number;
  offerChoiceFlat?: number;
}

export interface ActiveSkillEffect {
  durationSeconds: number;
  cooldownSeconds: number;
  fireRateMultiplier?: number;
  heatMultiplier?: number;
  autoFire?: boolean;
  emergencyVentFractionOfThermalCap?: number;
  disableWeapons?: boolean;
  disableThrusters?: boolean;
  disableShield?: boolean;
}

export interface SkillTierDefinition {
  description: string;
  modifiers?: SkillModifiers;
  activeEffect?: ActiveSkillEffect;
}

export interface SkillDefinition {
  id: PlayerSkillId;
  name: string;
  kind: PlayerSkillKind;
  baseWeight: number;
  defaultActiveKey?: ActiveSkillKey;
  tiers: readonly SkillTierDefinition[];
}

export interface LevelUpOffer {
  skillId: PlayerSkillId;
  name: string;
  kind: PlayerSkillKind;
  activeKey: ActiveSkillKey | null;
  currentTier: number;
  nextTier: number;
  maxTier: number;
  description: string;
}

export interface ActiveSkillRuntime {
  skillId: PlayerSkillId;
  key: ActiveSkillKey;
  activeUntil: number;
  cooldownUntil: number;
}

export interface PlayerProgressionState {
  level: number;
  totalXp: number;
  scrap: number;
  pendingLevelQueue: number[];
  currentOffers: LevelUpOffer[];
  ownedSkillTiers: Partial<Record<PlayerSkillId, number>>;
  activeSkillBindings: Partial<Record<ActiveSkillKey, PlayerSkillId | null>>;
  activeSkillRuntimes: Partial<Record<PlayerSkillId, ActiveSkillRuntime>>;
  offerCountBase: number;
}

export interface ResolvedPlayerStats {
  config: PlayerConfig;
  fireRateMultiplier: number;
  weaponRangeMultiplier: number;
  weaponHeatMultiplier: number;
  offerCount: number;
  autoFireSelectedWeapon: boolean;
  disableWeapons: boolean;
  disableThrusters: boolean;
  disableShield: boolean;
  emergencyVentHeatPerSecond: number;
}
