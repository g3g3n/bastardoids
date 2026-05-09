import type { PlayerConfig } from "../../types";
import { getPlayerSkillDefinition } from "./skills";
import type {
  ActiveSkillEffect,
  PlayerProgressionState,
  PlayerSkillId,
  ResolvedPlayerStats,
  SkillModifiers,
} from "./types";

export function resolvePlayerStats(
  baseConfig: PlayerConfig,
  progression: PlayerProgressionState,
  elapsed: number,
): ResolvedPlayerStats {
  const modifiers = collectPassiveSkillModifiers(progression);
  const activeEffects = getActiveSkillEffects(progression, elapsed);

  const activeFireRateMultiplier = activeEffects.reduce(
    (multiplier, activeEffect) => multiplier * (activeEffect.fireRateMultiplier ?? 1),
    1,
  );
  const activeHeatMultiplier = activeEffects.reduce(
    (multiplier, activeEffect) => multiplier * (activeEffect.heatMultiplier ?? 1),
    1,
  );
  const combinedFireRateMultiplier =
    (1 + (modifiers.fireRatePercent ?? 0)) * activeFireRateMultiplier;
  const combinedHeatMultiplier =
    (1 + (modifiers.weaponHeatPercent ?? 0)) * activeHeatMultiplier;

  const resolvedConfig: PlayerConfig = {
    ...baseConfig,
    thermalCap: Math.max(
      1,
      Math.round(
        baseConfig.thermalCap * (1 + (modifiers.thermalCapPercent ?? 0)) +
          (modifiers.thermalCapFlat ?? 0),
      ),
    ),
    vent: baseConfig.vent * (1 + (modifiers.ventPercent ?? 0)),
    thrust: baseConfig.thrust * (1 + (modifiers.thrustPercent ?? 0)),
    reverseThrust: baseConfig.reverseThrust * (1 + (modifiers.reverseThrustPercent ?? 0)),
    strafeThrust: baseConfig.strafeThrust * (1 + (modifiers.strafeThrustPercent ?? 0)),
    turnRate: baseConfig.turnRate * (1 + (modifiers.turnRatePercent ?? 0)),
    turnDamping: baseConfig.turnDamping * (1 + (modifiers.turnDampingPercent ?? 0)),
  };

  const emergencyVentHeatPerSecond = activeEffects.reduce(
    (sum, activeEffect) =>
      sum +
      (activeEffect.emergencyVentFractionOfThermalCap && activeEffect.durationSeconds > 0
        ? (resolvedConfig.thermalCap * activeEffect.emergencyVentFractionOfThermalCap) /
          activeEffect.durationSeconds
        : 0),
    0,
  );
  const disableWeapons = activeEffects.some((activeEffect) => activeEffect.disableWeapons);
  const disableThrusters = activeEffects.some((activeEffect) => activeEffect.disableThrusters);
  const disableShield = activeEffects.some((activeEffect) => activeEffect.disableShield);

  return {
    config: resolvedConfig,
    fireRateMultiplier: combinedFireRateMultiplier,
    weaponRangeMultiplier: 1 + (modifiers.weaponRangePercent ?? 0),
    weaponHeatMultiplier: combinedHeatMultiplier,
    offerCount: Math.max(1, progression.offerCountBase + (modifiers.offerChoiceFlat ?? 0)),
    autoFireSelectedWeapon: activeEffects.some((activeEffect) => activeEffect.autoFire),
    disableWeapons,
    disableThrusters,
    disableShield,
    emergencyVentHeatPerSecond,
  };
}

function collectPassiveSkillModifiers(progression: PlayerProgressionState): SkillModifiers {
  const merged: SkillModifiers = {};

  for (const [skillId, ownedTier] of Object.entries(progression.ownedSkillTiers)) {
    if (!ownedTier) {
      continue;
    }

    const definition = getPlayerSkillDefinition(skillId as PlayerSkillId);
    for (let tierIndex = 0; tierIndex < ownedTier; tierIndex += 1) {
      mergeModifiers(merged, definition.tiers[tierIndex]?.modifiers);
    }
  }

  return merged;
}

function getActiveSkillEffects(
  progression: PlayerProgressionState,
  elapsed: number,
): ActiveSkillEffect[] {
  const activeEffects: ActiveSkillEffect[] = [];

  for (const [skillId, activeRuntime] of Object.entries(progression.activeSkillRuntimes) as Array<
    [PlayerSkillId, NonNullable<PlayerProgressionState["activeSkillRuntimes"][PlayerSkillId]>]
  >) {
    if (!activeRuntime || activeRuntime.activeUntil <= elapsed) {
      continue;
    }

    const currentTier = progression.ownedSkillTiers[skillId] ?? 0;
    if (currentTier <= 0) {
      continue;
    }

    const activeEffect =
      getPlayerSkillDefinition(skillId).tiers[currentTier - 1]?.activeEffect ?? null;
    if (activeEffect) {
      activeEffects.push(activeEffect);
    }
  }

  return activeEffects;
}

function mergeModifiers(target: SkillModifiers, incoming?: SkillModifiers): void {
  if (!incoming) {
    return;
  }

  target.thermalCapFlat = (target.thermalCapFlat ?? 0) + (incoming.thermalCapFlat ?? 0);
  target.thermalCapPercent =
    (target.thermalCapPercent ?? 0) + (incoming.thermalCapPercent ?? 0);
  target.ventPercent = (target.ventPercent ?? 0) + (incoming.ventPercent ?? 0);
  target.fireRatePercent = (target.fireRatePercent ?? 0) + (incoming.fireRatePercent ?? 0);
  target.weaponRangePercent =
    (target.weaponRangePercent ?? 0) + (incoming.weaponRangePercent ?? 0);
  target.weaponHeatPercent =
    (target.weaponHeatPercent ?? 0) + (incoming.weaponHeatPercent ?? 0);
  target.thrustPercent = (target.thrustPercent ?? 0) + (incoming.thrustPercent ?? 0);
  target.reverseThrustPercent =
    (target.reverseThrustPercent ?? 0) + (incoming.reverseThrustPercent ?? 0);
  target.strafeThrustPercent =
    (target.strafeThrustPercent ?? 0) + (incoming.strafeThrustPercent ?? 0);
  target.turnRatePercent = (target.turnRatePercent ?? 0) + (incoming.turnRatePercent ?? 0);
  target.turnDampingPercent =
    (target.turnDampingPercent ?? 0) + (incoming.turnDampingPercent ?? 0);
  target.offerChoiceFlat = (target.offerChoiceFlat ?? 0) + (incoming.offerChoiceFlat ?? 0);
}
