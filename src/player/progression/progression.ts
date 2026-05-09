import { getAllPlayerSkills, getPlayerSkillDefinition } from "./skills";
import type {
  ActiveSkillKey,
  ActiveSkillRuntime,
  LevelUpOffer,
  PlayerProgressionState,
  PlayerSkillId,
  SkillDefinition,
} from "./types";
import { getLevelForXp } from "./xpTable";

export const HIGH_XP_STORAGE_KEY = "bastardoids-high-xp";
export const ACTIVE_SKILL_KEYS: readonly ActiveSkillKey[] = [
  "KeyQ",
  "KeyE",
  "KeyR",
  "KeyF",
  "KeyV",
];

export function createPlayerProgressionState(): PlayerProgressionState {
  return {
    level: 1,
    totalXp: 0,
    scrap: 0,
    pendingLevelQueue: [],
    currentOffers: [],
    ownedSkillTiers: {},
    activeSkillBindings: {
      KeyQ: null,
      KeyE: null,
      KeyR: null,
      KeyF: null,
      KeyV: null,
    },
    activeSkillRuntimes: {},
    offerCountBase: 3,
  };
}

export function loadHighestXp(): number {
  const raw = localStorage.getItem(HIGH_XP_STORAGE_KEY);
  const parsed = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function storeHighestXp(highestXp: number): void {
  localStorage.setItem(HIGH_XP_STORAGE_KEY, String(Math.max(0, Math.round(highestXp))));
}

export function queueProgressionRewards(
  progression: PlayerProgressionState,
  xpReward: number,
  scrapReward: number,
): void {
  progression.totalXp += Math.max(0, xpReward);
  progression.scrap += Math.max(0, scrapReward);

  const targetLevel = getLevelForXp(progression.totalXp);
  const effectiveLevel = progression.level + progression.pendingLevelQueue.length;
  for (let level = effectiveLevel + 1; level <= targetLevel; level += 1) {
    progression.pendingLevelQueue.push(level);
  }
}

export function syncExpiredActiveSkills(
  progression: PlayerProgressionState,
  elapsed: number,
): void {
  for (const [skillId, activeSkillRuntime] of Object.entries(progression.activeSkillRuntimes) as Array<
    [PlayerSkillId, ActiveSkillRuntime]
  >) {
    if (activeSkillRuntime.activeUntil > 0 && elapsed >= activeSkillRuntime.activeUntil) {
      progression.activeSkillRuntimes[skillId] = {
        skillId: activeSkillRuntime.skillId,
        key: activeSkillRuntime.key,
        activeUntil: 0,
        cooldownUntil: activeSkillRuntime.cooldownUntil,
      };
    }

    if (
      elapsed >= activeSkillRuntime.cooldownUntil &&
      progression.activeSkillRuntimes[skillId]?.activeUntil === 0
    ) {
      delete progression.activeSkillRuntimes[skillId];
    }
  }
}

export function activateBoundActiveSkill(
  progression: PlayerProgressionState,
  key: ActiveSkillKey,
  elapsed: number,
): boolean {
  const activeSkillId = progression.activeSkillBindings[key] ?? null;
  if (!activeSkillId) {
    return false;
  }

  const existingRuntime = progression.activeSkillRuntimes[activeSkillId];
  if (existingRuntime && elapsed < existingRuntime.cooldownUntil) {
    return false;
  }

  const currentTier = progression.ownedSkillTiers[activeSkillId] ?? 0;
  if (currentTier <= 0) {
    return false;
  }

  const definition = getPlayerSkillDefinition(activeSkillId);
  const activeEffect = definition.tiers[currentTier - 1]?.activeEffect;
  if (!activeEffect) {
    return false;
  }

  progression.activeSkillRuntimes[activeSkillId] = {
    skillId: activeSkillId,
    key,
    activeUntil: elapsed + activeEffect.durationSeconds,
    cooldownUntil: elapsed + activeEffect.durationSeconds + activeEffect.cooldownSeconds,
  };
  return true;
}

export function generateLevelUpOffers(
  progression: PlayerProgressionState,
  targetLevel: number,
  offerCount: number,
): LevelUpOffer[] {
  const skills = getAllPlayerSkills();
  const guaranteedActive = targetLevel % 3 === 0;
  const remainingOfferKind = guaranteedActive ? "any" : "passive";
  const chosenSkillIds = new Set<PlayerSkillId>();
  const offers: LevelUpOffer[] = [];

  if (guaranteedActive) {
    const activeOffer = pickWeightedSkill(
      getEligibleSkills(skills, progression, "active"),
      chosenSkillIds,
    );
    if (activeOffer) {
      offers.push(createOffer(activeOffer, progression));
      chosenSkillIds.add(activeOffer.id);
    }
  }

  while (offers.length < offerCount) {
    const candidate = pickWeightedSkill(
      getEligibleSkills(skills, progression, remainingOfferKind),
      chosenSkillIds,
    );
    if (!candidate) {
      break;
    }

    offers.push(createOffer(candidate, progression));
    chosenSkillIds.add(candidate.id);
  }

  progression.currentOffers = offers;
  return offers;
}

export function applyLevelUpOffer(
  progression: PlayerProgressionState,
  offerIndex: number,
): LevelUpOffer | null {
  const offer = progression.currentOffers[offerIndex];
  if (!offer) {
    return null;
  }

  const nextTier = offer.nextTier;
  progression.ownedSkillTiers[offer.skillId] = nextTier;
  if (offer.kind === "active") {
    const definition = getPlayerSkillDefinition(offer.skillId);
    if (definition.defaultActiveKey) {
      progression.activeSkillBindings[definition.defaultActiveKey] = offer.skillId;
    }
  }

  progression.currentOffers = [];
  const resolvedLevel = progression.pendingLevelQueue.shift();
  if (resolvedLevel) {
    progression.level = resolvedLevel;
  }

  return offer;
}

export function getNextPendingLevel(progression: PlayerProgressionState): number | null {
  return progression.pendingLevelQueue[0] ?? null;
}

export function hasPendingLevelUp(progression: PlayerProgressionState): boolean {
  return progression.pendingLevelQueue.length > 0;
}

function getEligibleSkills(
  skills: SkillDefinition[],
  progression: PlayerProgressionState,
  requiredKind: "any" | "active" | "passive",
): SkillDefinition[] {
  return skills.filter((skill) => {
    if (requiredKind === "active" && skill.kind !== "active") {
      return false;
    }
    if (requiredKind === "passive" && skill.kind !== "passive") {
      return false;
    }

    const currentTier = progression.ownedSkillTiers[skill.id] ?? 0;
    return currentTier < skill.tiers.length;
  });
}

function createOffer(skill: SkillDefinition, progression: PlayerProgressionState): LevelUpOffer {
  const currentTier = progression.ownedSkillTiers[skill.id] ?? 0;
  const nextTier = currentTier + 1;
  const nextTierDefinition = skill.tiers[nextTier - 1];

  return {
    skillId: skill.id,
    name: skill.name,
    kind: skill.kind,
    activeKey: skill.defaultActiveKey ?? null,
    currentTier,
    nextTier,
    maxTier: skill.tiers.length,
    description: nextTierDefinition?.description ?? skill.tiers[skill.tiers.length - 1].description,
  };
}

function pickWeightedSkill(
  skills: SkillDefinition[],
  excludedSkillIds: Set<PlayerSkillId>,
): SkillDefinition | null {
  const candidates = skills.filter((skill) => !excludedSkillIds.has(skill.id));
  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce((sum, skill) => sum + skill.baseWeight, 0);
  if (totalWeight <= 0) {
    return candidates[0];
  }

  let roll = Math.random() * totalWeight;
  for (const skill of candidates) {
    roll -= skill.baseWeight;
    if (roll <= 0) {
      return skill;
    }
  }

  return candidates[candidates.length - 1];
}

export function getBoundActiveSkill(
  progression: PlayerProgressionState,
  key: ActiveSkillKey,
): PlayerSkillId | null {
  return progression.activeSkillBindings[key] ?? null;
}
