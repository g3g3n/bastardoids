import type { AsteroidDefinition, AsteroidSize } from "../../types";

export const ASTEROID_DEFINITIONS = {
  medium: {
    mass: 90,
    radius: 6.6,
    visualScale: 1.25,
    maxHull: 40,
    xpReward: 2,
    scrapReward: 2,
    minSpeed: 8,
    maxSpeed: 17,
    rotationSpeedMin: 0.35,
    rotationSpeedMax: 0.9,
  },
  small: {
    mass: 55,
    radius: 3.9,
    visualScale: 1.20,
    maxHull: 20,
    xpReward: 1,
    scrapReward: 1,
    minSpeed: 11,
    maxSpeed: 20,
    rotationSpeedMin: 0.6,
    rotationSpeedMax: 1.4,
  },
} satisfies Record<AsteroidSize, AsteroidDefinition>;

export function getAsteroidDefinition(size: AsteroidSize): AsteroidDefinition {
  return ASTEROID_DEFINITIONS[size];
}
