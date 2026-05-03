import type { WeaponDefinition, WeaponName } from "../../types";

export const WEAPON_DEFINITIONS = {
  laser: {
    name: "laser",
    visual: "laserBolt",
    fireSound: "laserShot1",
    hitSound: "laserHit",
    hitVolumeAgainstAsteroid: 0.65,
    hitVolumeAgainstShip: 0.8,
    hitSoundOffsetSeconds: 0.41,
    hitSoundPlaybackRate: 1.25,
    heat: 35,
    shotsPerSecond: 2,
    speed: 82,
    lifetimeSeconds: 1.2,
    damage: 8,
    radius: 0.41,
    mass: 0.05,
    visualLength: 2.2,
    visualWidth: 0.28,
  },
  kineticTorpedo: {
    name: "kineticTorpedo",
    visual: "kineticTorpedo",
    hitSound: "explosion2",
    hitVolumeAgainstAsteroid: 0.75,
    hitVolumeAgainstShip: 0.85,
    hitSoundOffsetSeconds: 0.05,
    heat: 50,
    shotsPerSecond: 1.15,
    speed: 60,
    lifetimeSeconds: 2.2,
    damage: 20.5,
    radius: 2.15,
    mass: 0.18,
    visualLength: 3.2,
    visualWidth: 1.3,
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
