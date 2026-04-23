import type { AsteroidDefinition, AsteroidSize } from "../../types";

export const ASTEROID_DEFINITIONS = {
  large: {
    mass: 7,
    radius: 7.8,
    maxHealth: 4,
    minSpeed: 8,
    maxSpeed: 14,
    rotationSpeedMin: 0.35,
    rotationSpeedMax: 0.9,
  },
  small: {
    mass: 4,
    radius: 4.4,
    maxHealth: 2,
    minSpeed: 11,
    maxSpeed: 19,
    rotationSpeedMin: 0.6,
    rotationSpeedMax: 1.4,
  },
} satisfies Record<AsteroidSize, AsteroidDefinition>;

export function getAsteroidDefinition(size: AsteroidSize): AsteroidDefinition {
  return ASTEROID_DEFINITIONS[size];
}
