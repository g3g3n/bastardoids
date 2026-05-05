# Loadout And Module Mass Preparation Pass

## Summary
Prepare the codebase for installed-item mass without doing the full multi-weapon combat refactor yet.

Decisions chosen:
- Rename ship config/definition `mass` to `hullMass`
- Rename ship weapon field `primaryWeapon` to `weapon1`
- Keep the current single-weapon runtime flow for now
- Do **not** switch to a `weapons[]` array in this pass
- Treat runtime ship mass as:
  - `hullMass + installed item masses`
- For now, the only installed items that exist are weapons, but the helper structure should be generic so future ship modules plug into the same mass calculation

This pass should:
- split weapon `mass` into installed-item mass vs projectile impact mass
- make runtime ship mass resolve through generic installed-item helpers
- update all `primaryWeapon` references to `weapon1`
- keep projectile collision mass behavior intact via `projectileMass`
- avoid a large `main.ts` redesign, but extract the small logic that now clearly belongs outside it

## Implementation Changes
### 1. Weapon definition split
Update `WeaponDefinition` so:
- `mass` means installed weapon/module mass on the ship
- `projectileMass` means the physical mass of the fired projectile

Use these installed masses:
- `laser: 1.5`
- `kineticTorpedo: 3`
- `plasmaOrb: 3`

Preserve current projectile collision behavior by moving the existing projectile-body masses into `projectileMass`:
- `laser: 0.5`
- `kineticTorpedo: 2.0`
- `plasmaOrb: 5.0`

Keep `ProjectileEntity.mass` unchanged as the runtime projectile-body mass used in collision math.

### 2. Ship config rename and runtime mass resolution
Rename ship config/definition fields:
- `mass` -> `hullMass`
- `primaryWeapon` -> `weapon1`

Apply this to:
- player config
- enemy ship definitions
- `ShipMovementConfig`
- any shared ship-config helper types

Runtime ship entities should still keep:
- `mass`

But runtime `mass` should now resolve from generic installed items:
- `resolvedMass = hullMass + sum(installed item masses)`

For this pass:
- the only installed item source is `weapon1`
- but the helper naming and structure must assume later additions like passive modules, engines, reactors, or other ship components

Recommended type direction:
- allow `weapon1: WeaponName | null` so an empty slot is representable
- installed-item helpers should safely ignore null slots

### 3. Extract generic loadout/mass helpers
Do not broadly split `main.ts` yet, but extract the logic that now belongs to ship/loadout resolution into a small helper module under `src/entities/ships/`.

Add generic helpers such as:
- `getInstalledWeaponNames(shipConfig)`
- `getInstalledItemMass(shipConfig)`
- `getTotalShipMass(shipConfig)`
- `getWeaponInSlot(shipConfig, "weapon1")`
- optionally `getPrimaryFireWeapon(shipConfig)` as a staging helper around the current single-fire-button flow

Important requirement:
- helper naming should talk about installed items or installed mass where possible, not only weapons
- weapon-specific helpers are fine where needed for the current runtime, but total-mass helpers should be module-ready from the start

### 4. Update current runtime touchpoints
Refactor current code to use the new names and helpers:

In ship creation:
- player and enemy runtime `mass` should be resolved from `hullMass + installed item masses`

In projectile creation:
- source projectile physics mass from `weaponDefinition.projectileMass`

In firing and AI:
- replace direct `primaryWeapon` lookups with `weapon1`
- keep the current single-weapon cooldown/heat/firing behavior intact

In cached weapon config use:
- update the player weapon cache to source from `weapon1`
- keep it single-slot for now; no multi-weapon runtime state in this pass

### 5. Keep future multi-weapon and module evolution unblocked
This pass should explicitly **not** implement:
- `weapon2` / `weapon3`
- `weapons[]`
- per-weapon cooldown storage
- per-weapon AI weapon selection
- auto-firing turrets / point defense
- grouped active weapon selection
- non-weapon module definitions

But the structure chosen here must not block those later.

To support that:
- isolate slot lookups behind helpers
- isolate total-mass calculation behind helpers
- avoid baking weapon-only assumptions into runtime mass resolution
- keep the future path open for:
  - additional weapon slots
  - independent cooldowns
  - shared heat pool
  - auto-fire modules
  - non-weapon installed components contributing to mass

## Test Plan
Validate these scenarios:
- Build/typecheck passes after all renames.
- Player and hunter spawn with runtime mass equal to `hullMass + installed item mass`.
- Since only weapons exist today, current runtime mass should effectively be `hullMass + weapon1.mass`.
- Projectile collisions still use projectile-body mass, not installed weapon mass.
- Weapon firing, heat gain, cooldown, and sound still work for player and hunter after renaming to `weapon1`.
- AI still selects/uses the correct current weapon after the rename.
- Collision math for ships vs asteroids / ships / projectiles still behaves consistently with resolved runtime mass.
- A ship with `weapon1: null` is handled safely by loadout helpers, even if no current shipped config uses it yet.

Recommended spot checks:
- compare player runtime mass before and after the change
- confirm `createProjectile()` uses `projectileMass`
- confirm no remaining `primaryWeapon` references
- confirm no remaining weapon-definition `mass` references that still mean projectile mass

## Assumptions
- This is a preparation pass, not the full multi-weapon combat refactor.
- `weapon1` plus generic installed-item helpers is enough to support future expansion without switching to arrays now.
- Runtime ship `mass` remains the physics/collision/movement mass.
- `hullMass` is the bare ship mass before installed items are added.
- Installed-item mass is generic by design; today only weapons contribute, but later ship modules should plug into the same total-mass calculation without another conceptual rename.
