import { getWeaponDefinition } from "../projectiles/weaponDefinitions";
import type { ShipMovementConfig, WeaponName } from "../../types";

export type ShipWeaponSlot = "weapon1";

const SHIP_WEAPON_SLOTS: readonly ShipWeaponSlot[] = ["weapon1"];

export type ShipWeaponSlotsConfig = Pick<ShipMovementConfig, "weapon1">;
export type ShipLoadoutConfig = Pick<ShipMovementConfig, "hullMass" | "weapon1">;

export function getWeaponInSlot(
  shipConfig: ShipWeaponSlotsConfig,
  slot: ShipWeaponSlot,
): WeaponName | null {
  return shipConfig[slot] ?? null;
}

export function getInstalledWeaponNames(shipConfig: ShipWeaponSlotsConfig): WeaponName[] {
  const installedWeapons: WeaponName[] = [];

  for (const slot of SHIP_WEAPON_SLOTS) {
    const weaponName = getWeaponInSlot(shipConfig, slot);
    if (weaponName) {
      installedWeapons.push(weaponName);
    }
  }

  return installedWeapons;
}

export function getInstalledItemMass(shipConfig: ShipLoadoutConfig): number {
  return getInstalledWeaponNames(shipConfig).reduce(
    (totalMass, weaponName) => totalMass + getWeaponDefinition(weaponName).mass,
    0,
  );
}

export function getTotalShipMass(shipConfig: ShipLoadoutConfig): number {
  return shipConfig.hullMass + getInstalledItemMass(shipConfig);
}

export function getPrimaryFireWeapon(shipConfig: ShipWeaponSlotsConfig): WeaponName | null {
  return getWeaponInSlot(shipConfig, "weapon1");
}
