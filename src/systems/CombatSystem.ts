import * as THREE from "three";
import { AudioSystem } from "../audio/AudioSystem";
import { getAsteroidDefinition } from "../entities/asteroids/asteroidDefinitions";
import { getWeaponDefinition } from "../entities/projectiles/weaponDefinitions";
import { getPrimaryFireWeapon } from "../entities/ships/loadout";
import { getShipBasis } from "../entities/ships/shipController";
import { createWeaponProjectileMesh } from "../visuals/Weapons";
import type {
  AsteroidEntity,
  CollisionBody,
  DamageableEntity,
  EnemyShipEntity,
  PlayerState,
  ProjectileEntity,
  ReferenceGridBounds,
  ShipEntity,
} from "../types";
import type { ResolvedPlayerStats } from "../player/progression/types";

export interface CombatSystemCallbacks {
  allocateId: () => number;
  addObjectToScene: (object: THREE.Object3D) => void;
  removeObjectFromScene: (object: THREE.Object3D) => void;
  attachCollisionRing: (entity: { id: number; radius: number; position: THREE.Vector3 }) => void;
  removeCollisionRing: (entityId: number) => void;
  grantPlayerRewards: (xpReward: number, scrapReward: number) => void;
  splitLargeAsteroid: (asteroid: AsteroidEntity) => void;
  destroyAsteroid: (asteroid: AsteroidEntity, emitExplosion?: boolean) => void;
  destroyEnemy: (enemy: EnemyShipEntity, emitExplosion?: boolean) => void;
  destroyPlayerRun: () => void;
  isEnemyWithinPlayerXpRewardRadius: (enemy: EnemyShipEntity) => boolean;
}

export interface CombatSystemConfig {
  smallAsteroidCollisionDamage: number;
  mediumAsteroidCollisionDamage: number;
}

export interface CombatUpdateContext {
  delta: number;
  elapsed: number;
  player: PlayerState | null;
  asteroids: readonly AsteroidEntity[];
  enemies: readonly EnemyShipEntity[];
  resolvedPlayerStats: ResolvedPlayerStats;
}

export interface FireContext {
  elapsed: number;
  resolvedPlayerStats: ResolvedPlayerStats;
}

export class CombatSystem {
  private readonly audioSystem: AudioSystem;
  private readonly callbacks: CombatSystemCallbacks;
  private readonly config: CombatSystemConfig;
  private readonly projectiles = new Map<number, ProjectileEntity>();
  private playerLastShotAt = -Infinity;

  constructor(
    audioSystem: AudioSystem,
    callbacks: CombatSystemCallbacks,
    config: CombatSystemConfig,
  ) {
    this.audioSystem = audioSystem;
    this.callbacks = callbacks;
    this.config = config;
  }

  reset(): void {
    this.clearProjectiles();
    this.playerLastShotAt = -Infinity;
  }

  clearProjectiles(): void {
    for (const projectile of [...this.projectiles.values()]) {
      this.destroyProjectile(projectile);
    }
  }

  getProjectilesSnapshot(): ProjectileEntity[] {
    return [...this.projectiles.values()];
  }

  tryFirePlayerPrimaryWeapon(
    player: PlayerState | null,
    resolvedPlayerStats: ResolvedPlayerStats,
    elapsed: number,
  ): void {
    if (!player) {
      return;
    }

    const playerWeaponName = getPrimaryFireWeapon(resolvedPlayerStats.config);
    if (!playerWeaponName) {
      return;
    }

    const playerWeaponConfig = getWeaponDefinition(playerWeaponName);
    const minDelay =
      1 / (playerWeaponConfig.shotsPerSecond * resolvedPlayerStats.fireRateMultiplier);
    if (elapsed - this.playerLastShotAt < minDelay) {
      return;
    }

    if (this.fireShipPrimaryWeapon(player, resolvedPlayerStats.config, { elapsed, resolvedPlayerStats })) {
      this.playerLastShotAt = elapsed;
    }
  }

  fireShipPrimaryWeapon(
    ship: PlayerState | EnemyShipEntity,
    shipConfig: {
      weapon1: ProjectileEntity["weapon"] | null;
      muzzleOffsetForward: number;
      muzzleOffsetSide: number;
    },
    context: FireContext,
  ): boolean {
    const weaponName = getPrimaryFireWeapon(shipConfig);
    if (!weaponName) {
      return false;
    }

    const weaponDefinition = getWeaponDefinition(weaponName);
    const weaponHeatCost = this.getWeaponHeatCost(ship, weaponDefinition, context.resolvedPlayerStats);
    if (!this.canShipFireWeapon(ship, weaponHeatCost, context.resolvedPlayerStats)) {
      return false;
    }

    ship.heat = Math.min(ship.thermalCap, ship.heat + weaponHeatCost);
    if (weaponDefinition.fireSound) {
      this.audioSystem.playSfx(weaponDefinition.fireSound, {
        volume: ship.faction === "enemy" ? 0.4 : 0.65,
        playbackRateMin: 0.92,
        playbackRateMax: 1.06,
      });
    }

    const { forward, right } = getShipBasis(ship.yaw);
    const baseVelocity = ship.velocity
      .clone()
      .add(forward.clone().multiplyScalar(weaponDefinition.speed));
    const muzzleForward = forward.clone().multiplyScalar(shipConfig.muzzleOffsetForward);

    if (weaponDefinition.name === "plasmaOrb") {
      this.createProjectile(
        ship.id,
        ship.faction,
        weaponDefinition.name,
        ship.position.clone().add(muzzleForward),
        baseVelocity,
        this.getWeaponLifetimeSeconds(ship, weaponDefinition, context.resolvedPlayerStats),
        context.elapsed,
      );
      return true;
    }

    const sideOffset = right.clone().multiplyScalar(shipConfig.muzzleOffsetSide);

    this.createProjectile(
      ship.id,
      ship.faction,
      weaponDefinition.name,
      ship.position.clone().add(muzzleForward).add(sideOffset),
      baseVelocity.clone(),
      this.getWeaponLifetimeSeconds(ship, weaponDefinition, context.resolvedPlayerStats),
      context.elapsed,
    );
    this.createProjectile(
      ship.id,
      ship.faction,
      weaponDefinition.name,
      ship.position.clone().add(muzzleForward).sub(sideOffset),
      baseVelocity.clone(),
      this.getWeaponLifetimeSeconds(ship, weaponDefinition, context.resolvedPlayerStats),
      context.elapsed,
    );
    return true;
  }

  updateProjectiles(context: CombatUpdateContext): void {
    for (const projectile of [...this.projectiles.values()]) {
      projectile.position.addScaledVector(projectile.velocity, context.delta);
      projectile.mesh.position.copy(projectile.position);
      projectile.mesh.rotation.y = Math.atan2(projectile.velocity.x, projectile.velocity.z);

      if (context.elapsed >= projectile.expiresAt) {
        this.destroyProjectile(projectile);
      }
    }

    for (const projectile of [...this.projectiles.values()]) {
      if (!projectile.alive) {
        continue;
      }

      const target = this.findProjectileHitTarget(
        projectile,
        context.player,
        context.asteroids,
        context.enemies,
      );
      if (!target) {
        continue;
      }

      this.playProjectileHitSfx(projectile, target);
      this.applyProjectileImpact(projectile, target);
      this.destroyProjectile(projectile);
      this.applyDamageToEntity(
        target,
        projectile.damage,
        projectile.faction === "player",
        context.elapsed,
        context.resolvedPlayerStats,
      );
    }
  }

  cleanupProjectilesOutsideBounds(
    player: PlayerState | null,
    bounds: ReferenceGridBounds,
  ): void {
    if (!player) {
      return;
    }

    for (const projectile of [...this.projectiles.values()]) {
      const deltaX = Math.abs(projectile.position.x - player.position.x);
      const deltaZ = Math.abs(projectile.position.z - player.position.z);
      if (deltaX > bounds.halfWidth || deltaZ > bounds.halfDepth) {
        this.destroyProjectile(projectile);
      }
    }
  }

  applyAsteroidCollisionDamage(
    first: CollisionBody,
    second: CollisionBody,
    elapsed: number,
    resolvedPlayerStats: ResolvedPlayerStats,
  ): void {
    if (first.type === "asteroid" && second.type !== "asteroid") {
      this.applyShipCollisionDamageFromAsteroid(second, first, elapsed, resolvedPlayerStats);
      return;
    }

    if (second.type === "asteroid" && first.type !== "asteroid") {
      this.applyShipCollisionDamageFromAsteroid(first, second, elapsed, resolvedPlayerStats);
    }
  }

  private applyShipCollisionDamageFromAsteroid(
    ship: CollisionBody,
    asteroid: AsteroidEntity,
    elapsed: number,
    resolvedPlayerStats: ResolvedPlayerStats,
  ): void {
    if (ship.type !== "player") {
      return;
    }

    const damage =
      asteroid.size === "small"
        ? this.config.smallAsteroidCollisionDamage
        : this.config.mediumAsteroidCollisionDamage;
    this.applyDamageToEntity(ship, damage, false, elapsed, resolvedPlayerStats);
  }

  private createProjectile(
    ownerId: number,
    faction: "player" | "enemy",
    weaponName: ProjectileEntity["weapon"],
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    lifetimeSeconds: number,
    elapsed: number,
  ): ProjectileEntity {
    const weaponDefinition = getWeaponDefinition(weaponName);
    const mesh = createWeaponProjectileMesh(weaponDefinition);
    mesh.position.copy(position);
    mesh.rotation.y = Math.atan2(velocity.x, velocity.z);

    const projectile: ProjectileEntity = {
      id: this.callbacks.allocateId(),
      type: "projectile",
      ownerId,
      weapon: weaponDefinition.name,
      faction,
      mass: weaponDefinition.projectileMass,
      damage: weaponDefinition.damage,
      radius: weaponDefinition.radius,
      mesh,
      position: position.clone(),
      velocity: velocity.clone(),
      expiresAt: elapsed + lifetimeSeconds,
      alive: true,
    };

    this.projectiles.set(projectile.id, projectile);
    this.callbacks.addObjectToScene(mesh);
    this.callbacks.attachCollisionRing(projectile);
    return projectile;
  }

  private destroyProjectile(projectile: ProjectileEntity): void {
    projectile.alive = false;
    this.projectiles.delete(projectile.id);
    this.callbacks.removeCollisionRing(projectile.id);
    this.callbacks.removeObjectFromScene(projectile.mesh);
  }

  private playProjectileHitSfx(
    projectile: ProjectileEntity,
    target: AsteroidEntity | EnemyShipEntity | PlayerState,
  ): void {
    const weaponDefinition = getWeaponDefinition(projectile.weapon);
    if (!weaponDefinition.hitSound) {
      return;
    }

    const hitVolume =
      target.type === "asteroid"
        ? weaponDefinition.hitVolumeAgainstAsteroid
        : weaponDefinition.hitVolumeAgainstShip;
    this.audioSystem.playSfx(weaponDefinition.hitSound, {
      volume: hitVolume ?? 1,
      offsetSeconds: weaponDefinition.hitSoundOffsetSeconds,
      playbackRateMin: weaponDefinition.hitSoundPlaybackRate,
      playbackRateMax: weaponDefinition.hitSoundPlaybackRate,
    });
  }

  private findProjectileHitTarget(
    projectile: ProjectileEntity,
    player: PlayerState | null,
    asteroids: readonly AsteroidEntity[],
    enemies: readonly EnemyShipEntity[],
  ): AsteroidEntity | EnemyShipEntity | PlayerState | null {
    const candidates: Array<AsteroidEntity | EnemyShipEntity | PlayerState> = [
      ...asteroids,
      ...enemies,
    ];

    if (player) {
      candidates.push(player);
    }

    let bestTarget: AsteroidEntity | EnemyShipEntity | PlayerState | null = null;
    let bestDistanceSq = Infinity;

    for (const candidate of candidates) {
      if (!candidate.alive) {
        continue;
      }

      if (candidate.type !== "asteroid" && candidate.id === projectile.ownerId) {
        continue;
      }

      const hitDistance = projectile.radius + candidate.radius;
      const distanceSq = projectile.position.distanceToSquared(candidate.position);
      if (distanceSq > hitDistance * hitDistance || distanceSq >= bestDistanceSq) {
        continue;
      }

      bestDistanceSq = distanceSq;
      bestTarget = candidate;
    }

    return bestTarget;
  }

  private applyProjectileImpact(
    projectile: ProjectileEntity,
    target: AsteroidEntity | EnemyShipEntity | PlayerState,
  ): void {
    const combinedMass = target.mass + projectile.mass;
    if (combinedMass <= 0) {
      return;
    }

    const postImpactVelocity = target.velocity
      .clone()
      .multiplyScalar(target.mass)
      .addScaledVector(projectile.velocity, projectile.mass)
      .multiplyScalar(1 / combinedMass);
    target.velocity.copy(postImpactVelocity);

    if (target.type !== "asteroid") {
      return;
    }

    const impactOffset = projectile.position.clone().sub(target.position).setY(0);
    if (impactOffset.lengthSq() > 0.0001) {
      const tangent = new THREE.Vector3(-impactOffset.z, 0, impactOffset.x).normalize();
      const tangentialSpeed = projectile.velocity.dot(tangent);
      const spinImpulse =
        (tangentialSpeed * projectile.mass) / Math.max(target.mass * target.radius, 0.001);
      target.rotationSpeed += THREE.MathUtils.clamp(spinImpulse, -1.5, 1.5);
    }
  }

  private applyDamageToEntity(
    entity: DamageableEntity,
    damage: number,
    awardsPlayer: boolean,
    elapsed: number,
    resolvedPlayerStats: ResolvedPlayerStats,
  ): void {
    if (!entity.alive || damage <= 0) {
      return;
    }

    entity.shieldRegenCooldownUntil = elapsed + entity.shieldRegenDelaySeconds;

    let remainingDamage = damage;
    const shieldDisabled = entity.type === "player" && resolvedPlayerStats.disableShield;
    if (!shieldDisabled && entity.shield > 0) {
      const absorbed = Math.min(entity.shield, remainingDamage);
      entity.shield -= absorbed;
      remainingDamage -= absorbed;
    }

    if (remainingDamage > 0) {
      entity.hull = Math.max(0, entity.hull - remainingDamage);
    }

    if (entity.hull > 0) {
      return;
    }

    if (entity.type === "asteroid") {
      if (awardsPlayer) {
        const asteroidReward = getAsteroidDefinition(entity.size);
        this.callbacks.grantPlayerRewards(asteroidReward.xpReward, asteroidReward.scrapReward);
      }
      if (entity.size === "small") {
        this.callbacks.destroyAsteroid(entity);
      } else {
        this.callbacks.splitLargeAsteroid(entity);
      }
      return;
    }

    if (entity.type === "enemyShip") {
      if (awardsPlayer) {
        this.callbacks.grantPlayerRewards(entity.definition.xpReward, entity.definition.scrapReward);
      } else if (this.callbacks.isEnemyWithinPlayerXpRewardRadius(entity)) {
        this.callbacks.grantPlayerRewards(entity.definition.xpReward, 0);
      }
      this.callbacks.destroyEnemy(entity);
      return;
    }

    this.callbacks.destroyPlayerRun();
  }

  private getWeaponHeatCost(
    ship: ShipEntity,
    weaponDefinition: ReturnType<typeof getWeaponDefinition>,
    resolvedPlayerStats: ResolvedPlayerStats,
  ): number {
    if (ship.type !== "player") {
      return weaponDefinition.heat;
    }

    return weaponDefinition.heat * resolvedPlayerStats.weaponHeatMultiplier;
  }

  private getWeaponLifetimeSeconds(
    ship: ShipEntity,
    weaponDefinition: ReturnType<typeof getWeaponDefinition>,
    resolvedPlayerStats: ResolvedPlayerStats,
  ): number {
    if (ship.type !== "player") {
      return weaponDefinition.lifetimeSeconds;
    }

    return weaponDefinition.lifetimeSeconds * resolvedPlayerStats.weaponRangeMultiplier;
  }

  private canShipFireWeapon(
    ship: ShipEntity,
    weaponHeatCost: number,
    resolvedPlayerStats: ResolvedPlayerStats,
  ): boolean {
    if (ship.type === "player" && resolvedPlayerStats.disableWeapons) {
      return false;
    }

    return ship.heat + weaponHeatCost <= ship.thermalCap;
  }
}
