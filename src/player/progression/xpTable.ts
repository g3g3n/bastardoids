export const XP_LEVEL_THRESHOLDS: readonly number[] = [
  0,
  10,
  25,
  45,
  70,
  105,
  160,
  215,
  280,
  375,
  485,
  600,
  730,
  885,
  1020,
];

export function getLevelForXp(totalXp: number): number {
  let level = 1;
  for (let index = 1; index < XP_LEVEL_THRESHOLDS.length; index += 1) {
    if (totalXp < XP_LEVEL_THRESHOLDS[index]) {
      break;
    }
    level = index + 1;
  }
  return level;
}

export function getXpThresholdForLevel(level: number): number {
  const clampedLevel = Math.max(level, 1);
  if (clampedLevel <= XP_LEVEL_THRESHOLDS.length) {
    return XP_LEVEL_THRESHOLDS[clampedLevel - 1];
  }

  const lastThreshold = XP_LEVEL_THRESHOLDS[XP_LEVEL_THRESHOLDS.length - 1];
  const previousThreshold = XP_LEVEL_THRESHOLDS[XP_LEVEL_THRESHOLDS.length - 2];
  const fallbackStep = lastThreshold - previousThreshold;
  return lastThreshold + fallbackStep * (clampedLevel - XP_LEVEL_THRESHOLDS.length);
}

export function getXpProgressForLevel(totalXp: number, level: number): {
  levelStartXp: number;
  nextLevelXp: number;
  clampedXp: number;
} {
  const levelStartXp = getXpThresholdForLevel(level);
  const nextLevelXp = getXpThresholdForLevel(level + 1);
  return {
    levelStartXp,
    nextLevelXp,
    clampedXp: Math.max(levelStartXp, Math.min(totalXp, nextLevelXp)),
  };
}
