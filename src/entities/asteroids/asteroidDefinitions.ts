import type { AsteroidDefinition, AsteroidSize } from "../../types";

export const ASTEROID_DEFINITIONS = {
  large: {
    mass: 4.2,
    radius: 6.6,
    maxHull: 40,
    minSpeed: 8,
    maxSpeed: 14,
    rotationSpeedMin: 0.35,
    rotationSpeedMax: 0.9,
  },
  small: {
    mass: 2.5,
    radius: 3.9,
    maxHull: 20,
    minSpeed: 11,
    maxSpeed: 19,
    rotationSpeedMin: 0.6,
    rotationSpeedMax: 1.4,
  },
} satisfies Record<AsteroidSize, AsteroidDefinition>;

export function getAsteroidDefinition(size: AsteroidSize): AsteroidDefinition {
  return ASTEROID_DEFINITIONS[size];
}
