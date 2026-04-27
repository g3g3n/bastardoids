import type { WeaponDefinition, WeaponName } from "../../types";

export const WEAPON_DEFINITIONS = {
  laser: {
    name: "laser",
    visual: "laserBolt",
    fireSound: "laserShot1",
    hitSound: "laserHit",
    hitVolumeAgainstAsteroid: 0.65,
    hitVolumeAgainstShip: 0.8,
    hitSoundOffsetSeconds: 0.37,
    hitSoundPlaybackRate: 1.25,
    heat: 35,
    shotsPerSecond: 2,
    speed: 82,
    lifetimeSeconds: 1.2,
    damage: 10,
    radius: 0.38,
    mass: 0.05,
    visualLength: 2.2,
    visualWidth: 0.28,
  },
  kineticTorpedo: {
    name: "kineticTorpedo",
    visual: "kineticTorpedo",
    heat: 60,
    shotsPerSecond: 1.15,
    speed: 58,
    lifetimeSeconds: 2.2,
    damage: 20,
    radius: 0.58,
    mass: 0.18,
    visualLength: 3.2,
    visualWidth: 0.8,
  },
  plasmaOrb: {
    name: "plasmaOrb",
    visual: "plasmaOrb",
    fireSound: "plasmaOrbShot1",
    heat: 45,
    shotsPerSecond: 1.65,
    speed: 68,
    lifetimeSeconds: 1.8,
    damage: 30,
    radius: 0.87,
    mass: 0.52,
    visualLength: 1.8,
    visualWidth: 2.43,
  },
} satisfies Record<WeaponName, WeaponDefinition>;

export function getWeaponDefinition(name: WeaponName): WeaponDefinition {
  return WEAPON_DEFINITIONS[name];
}
