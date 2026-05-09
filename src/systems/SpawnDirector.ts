import * as THREE from "three";
import { getAsteroidDefinition } from "../entities/asteroids/asteroidDefinitions";
import type {
  AsteroidSize,
  EnemyShipEntity,
  EnemyShipName,
  PlayerState,
  ReferenceGridBounds,
  SpawningConfig,
  WorldConfig,
} from "../types";

const T1_ENEMY_VARIANTS: readonly EnemyShipName[] = ["Hunter T", "Hunter L", "Hunter P"];
const INITIAL_T1_ENEMY_PAIR_SPAWN_AT = 30;
const T1_ENEMY_RESPAWN_CHECK_INTERVAL = 45;
const T1_ENEMY_SPAWN_AXIS_DISTANCE = 400;
const T1_ENEMY_SPAWN_ORTHOGONAL_RANGE = 200;
const T1_ENEMY_ACTIVE_CHECK_RANGE = 400;
const INITIAL_ASTEROID_COUNT = 10;
const INITIAL_ASTEROID_OFFSET_MIN = 170;
const INITIAL_ASTEROID_OFFSET_MAX = 300;

export interface SpawnDirectorUpdateContext {
  delta: number;
  elapsed: number;
  player: PlayerState | null;
  enemies: Iterable<EnemyShipEntity>;
  cameraForward: THREE.Vector3;
  cameraRight: THREE.Vector3;
  getPlayerBounds: (distanceScreens: number) => ReferenceGridBounds;
  spawnEnemy: (name: EnemyShipName, position: THREE.Vector3) => void;
  createAsteroid: (size: AsteroidSize, position: THREE.Vector3, velocity: THREE.Vector3) => void;
}

export class SpawnDirector {
  private readonly world: WorldConfig;
  private readonly spawnConfig: SpawningConfig;
  private asteroidSpawnCooldown = 0;
  private initialT1EnemyPairSpawned = false;
  private nextT1EnemySpawnCheckAt = INITIAL_T1_ENEMY_PAIR_SPAWN_AT;

  constructor(world: WorldConfig, spawnConfig: SpawningConfig) {
    this.world = world;
    this.spawnConfig = spawnConfig;
  }

  reset(): void {
    this.asteroidSpawnCooldown = this.getNextSpawnDelay(0);
    this.initialT1EnemyPairSpawned = false;
    this.nextT1EnemySpawnCheckAt = INITIAL_T1_ENEMY_PAIR_SPAWN_AT;
  }

  spawnInitialAsteroids(
    player: PlayerState | null,
    createAsteroid: (size: AsteroidSize, position: THREE.Vector3, velocity: THREE.Vector3) => void,
  ): void {
    if (!player) {
      return;
    }

    for (let index = 0; index < INITIAL_ASTEROID_COUNT; index += 1) {
      const size = this.getRandomAsteroidSize();
      const asteroidCfg = getAsteroidDefinition(size);
      const offset = this.getRandomInitialAsteroidOffset();
      const spawnPosition = player.position.clone().add(offset);
      const toCenter = player.position.clone().sub(spawnPosition).setY(0).normalize();
      const angleOffset = (Math.random() - 0.5) * (Math.PI / 2.2);
      const velocity = toCenter
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset)
        .multiplyScalar(
          asteroidCfg.minSpeed + Math.random() * (asteroidCfg.maxSpeed - asteroidCfg.minSpeed),
        );

      createAsteroid(size, spawnPosition, velocity);
    }
  }

  update(context: SpawnDirectorUpdateContext): void {
    this.updateT1EnemySpawns(context);

    this.asteroidSpawnCooldown -= context.delta;
    if (this.asteroidSpawnCooldown > 0) {
      return;
    }

    this.spawnAsteroid(context);
    this.asteroidSpawnCooldown = this.getNextSpawnDelay(context.elapsed);
  }

  private updateT1EnemySpawns(context: SpawnDirectorUpdateContext): void {
    if (!context.player) {
      return;
    }

    if (!this.initialT1EnemyPairSpawned) {
      if (context.elapsed < INITIAL_T1_ENEMY_PAIR_SPAWN_AT) {
        return;
      }

      this.spawnInitialT1EnemyPair(context.player, context.spawnEnemy);
      this.initialT1EnemyPairSpawned = true;
      this.nextT1EnemySpawnCheckAt =
        INITIAL_T1_ENEMY_PAIR_SPAWN_AT + T1_ENEMY_RESPAWN_CHECK_INTERVAL;
      return;
    }

    if (context.elapsed < this.nextT1EnemySpawnCheckAt) {
      return;
    }

    if (this.countNearbyActiveEnemies(context.player, context.enemies) < 2) {
      this.spawnRandomT1EnemyAtOffset(context.player, context.spawnEnemy, this.getRandomT1EnemySpawnOffset());
    }

    this.nextT1EnemySpawnCheckAt += T1_ENEMY_RESPAWN_CHECK_INTERVAL;
  }

  private spawnAsteroid(context: SpawnDirectorUpdateContext): void {
    if (!context.player) {
      return;
    }

    const spawnBounds = context.getPlayerBounds(this.world.asteroidDistanceScreens);
    const spawnSide = Math.floor(Math.random() * 4);
    const along = (Math.random() - 0.5) * 2;
    const center = context.player.position.clone();
    const spawnPosition = center.clone();

    if (spawnSide === 0) {
      spawnPosition.addScaledVector(context.cameraRight, spawnBounds.halfWidth * along);
      spawnPosition.addScaledVector(context.cameraForward, spawnBounds.halfDepth);
    } else if (spawnSide === 1) {
      spawnPosition.addScaledVector(context.cameraRight, spawnBounds.halfWidth * along);
      spawnPosition.addScaledVector(context.cameraForward, -spawnBounds.halfDepth);
    } else if (spawnSide === 2) {
      spawnPosition.addScaledVector(context.cameraForward, spawnBounds.halfDepth * along);
      spawnPosition.addScaledVector(context.cameraRight, spawnBounds.halfWidth);
    } else {
      spawnPosition.addScaledVector(context.cameraForward, spawnBounds.halfDepth * along);
      spawnPosition.addScaledVector(context.cameraRight, -spawnBounds.halfWidth);
    }

    const size = this.getRandomAsteroidSize();
    const asteroidCfg = getAsteroidDefinition(size);
    const toCenter = center.clone().sub(spawnPosition).setY(0).normalize();
    const angleOffset = (Math.random() - 0.5) * (Math.PI / 2.2);
    const velocity = toCenter
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset)
      .multiplyScalar(
        asteroidCfg.minSpeed + Math.random() * (asteroidCfg.maxSpeed - asteroidCfg.minSpeed),
      );

    context.createAsteroid(size, spawnPosition, velocity);
  }

  private getNextSpawnDelay(elapsed: number): number {
    const rateIncreaseSteps = Math.floor(elapsed / this.spawnConfig.increaseEverySeconds);
    const asteroidsPerEight =
      this.spawnConfig.basePerEightSeconds +
      rateIncreaseSteps * this.spawnConfig.increasePerEightSeconds;
    const baseDelay = 8 / asteroidsPerEight;
    return Math.max(0.35, baseDelay + (Math.random() * 2 - 1) * this.spawnConfig.jitterSeconds);
  }

  private getRandomAsteroidSize(): AsteroidSize {
    return Math.random() < 0.4 ? "medium" : "small";
  }

  private getRandomInitialAsteroidOffset(): THREE.Vector3 {
    const randomAxisOffset = (): number => {
      const magnitude = THREE.MathUtils.randFloat(
        INITIAL_ASTEROID_OFFSET_MIN,
        INITIAL_ASTEROID_OFFSET_MAX,
      );
      return (Math.random() < 0.5 ? -1 : 1) * magnitude;
    };

    return new THREE.Vector3(randomAxisOffset(), 0, randomAxisOffset());
  }

  private getRandomT1EnemyVariant(): EnemyShipName {
    const index = Math.floor(Math.random() * T1_ENEMY_VARIANTS.length);
    return T1_ENEMY_VARIANTS[index] ?? T1_ENEMY_VARIANTS[0];
  }

  private getRandomT1EnemySpawnOffset(): THREE.Vector3 {
    const orthogonalOffset = THREE.MathUtils.randFloat(
      -T1_ENEMY_SPAWN_ORTHOGONAL_RANGE,
      T1_ENEMY_SPAWN_ORTHOGONAL_RANGE,
    );
    const sign = Math.random() < 0.5 ? -1 : 1;

    if (Math.random() < 0.5) {
      return new THREE.Vector3(sign * T1_ENEMY_SPAWN_AXIS_DISTANCE, 0, orthogonalOffset);
    }

    return new THREE.Vector3(orthogonalOffset, 0, sign * T1_ENEMY_SPAWN_AXIS_DISTANCE);
  }

  private spawnRandomT1EnemyAtOffset(
    player: PlayerState,
    spawnEnemy: (name: EnemyShipName, position: THREE.Vector3) => void,
    offset: THREE.Vector3,
  ): void {
    spawnEnemy(this.getRandomT1EnemyVariant(), player.position.clone().add(offset));
  }

  private spawnInitialT1EnemyPair(
    player: PlayerState,
    spawnEnemy: (name: EnemyShipName, position: THREE.Vector3) => void,
  ): void {
    const firstOffset = this.getRandomT1EnemySpawnOffset();
    this.spawnRandomT1EnemyAtOffset(player, spawnEnemy, firstOffset);
    this.spawnRandomT1EnemyAtOffset(player, spawnEnemy, firstOffset.clone().multiplyScalar(-1));
  }

  private countNearbyActiveEnemies(
    player: PlayerState,
    enemies: Iterable<EnemyShipEntity>,
  ): number {
    let count = 0;
    for (const enemy of enemies) {
      if (!enemy.alive) {
        continue;
      }

      const dx = Math.abs(enemy.position.x - player.position.x);
      const dz = Math.abs(enemy.position.z - player.position.z);
      if (dx <= T1_ENEMY_ACTIVE_CHECK_RANGE && dz <= T1_ENEMY_ACTIVE_CHECK_RANGE) {
        count += 1;
      }
    }

    return count;
  }
}
