import * as THREE from "three";
import type {
  AfterburnerConfig,
  EnemyShipEntity,
  PlayerState,
  ShipEntity,
  ThrusterConfig,
  ThrusterEmitter,
  ThrusterName,
  ThrusterParticle,
  ThrusterStateMap,
} from "../types";

const THRUSTER_NAMES: ThrusterName[] = ["forward", "reverse", "left", "right"];

export interface ThrusterParticleUpdateContext {
  delta: number;
  player: PlayerState | null;
  enemies: Iterable<EnemyShipEntity>;
  playerThrusterInputState: ThrusterStateMap<boolean>;
  afterburnerRamp: number;
}

export class ThrusterParticleSystem {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;

  private readonly thrusterConfig: ThrusterConfig;
  private readonly afterburnerConfig: AfterburnerConfig;
  private readonly playerVisualScale: number;
  private readonly particlePool: ThrusterParticle[] = [];
  private readonly particlePositions: Float32Array;
  private readonly particleColors: Float32Array;
  private readonly playerEmissionCarry: ThrusterStateMap<number> = {
    forward: 0,
    reverse: 0,
    left: 0,
    right: 0,
  };
  private readonly playerHoldTime: ThrusterStateMap<number> = {
    forward: 0,
    reverse: 0,
    left: 0,
    right: 0,
  };

  constructor(
    scene: THREE.Scene,
    thrusterConfig: ThrusterConfig,
    afterburnerConfig: AfterburnerConfig,
    playerVisualScale: number,
  ) {
    this.thrusterConfig = thrusterConfig;
    this.afterburnerConfig = afterburnerConfig;
    this.playerVisualScale = playerVisualScale;

    const maxParticles = thrusterConfig.maxParticles;
    const geometry = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(maxParticles * 3);
    this.particleColors = new Float32Array(maxParticles * 3);

    for (let index = 0; index < maxParticles; index += 1) {
      const offset = index * 3;
      this.particlePositions[offset] = 0;
      this.particlePositions[offset + 1] = -9999;
      this.particlePositions[offset + 2] = 0;
      this.particleColors[offset] = 1;
      this.particleColors[offset + 1] = 0.65;
      this.particleColors[offset + 2] = 0.2;
      this.particlePool.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        lifetime: 0,
        whiteness: 0,
      });
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(this.particlePositions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.particleColors, 3));

    const material = new THREE.PointsMaterial({
      size: thrusterConfig.particleSize,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(context: ThrusterParticleUpdateContext): void {
    this.updatePlayerHoldState(context.delta, context.playerThrusterInputState);
    this.updateEnemyHoldState(context.delta, context.enemies);

    for (const particle of this.particlePool) {
      if (!particle.active) {
        continue;
      }

      particle.age += context.delta;
      if (particle.age >= particle.lifetime) {
        particle.active = false;
        continue;
      }

      particle.position.addScaledVector(particle.velocity, context.delta);
    }

    if (context.player) {
      this.emitPlayerThrusterParticles("forward", context);
      this.emitPlayerThrusterParticles("reverse", context);
      this.emitPlayerThrusterParticles("left", context);
      this.emitPlayerThrusterParticles("right", context);
    }

    for (const enemy of context.enemies) {
      if (!enemy.alive) {
        continue;
      }

      this.emitEnemyThrusterParticles(enemy, "forward", context.delta);
      this.emitEnemyThrusterParticles(enemy, "reverse", context.delta);
      this.emitEnemyThrusterParticles(enemy, "left", context.delta);
      this.emitEnemyThrusterParticles(enemy, "right", context.delta);
    }

    this.syncParticleGeometry();
  }

  reset(): void {
    for (const key of THRUSTER_NAMES) {
      this.playerHoldTime[key] = 0;
      this.playerEmissionCarry[key] = 0;
    }

    for (const particle of this.particlePool) {
      particle.active = false;
      particle.age = 0;
      particle.lifetime = 0;
      particle.whiteness = 0;
      particle.position.set(0, -9999, 0);
      particle.velocity.set(0, 0, 0);
    }

    this.syncParticleGeometry();
  }

  private updatePlayerHoldState(
    delta: number,
    playerThrusterInputState: ThrusterStateMap<boolean>,
  ): void {
    const buildup = this.thrusterConfig.buildupSeconds;
    for (const key of THRUSTER_NAMES) {
      this.playerHoldTime[key] = playerThrusterInputState[key]
        ? Math.min(this.playerHoldTime[key] + delta, buildup)
        : 0;
    }
  }

  private updateEnemyHoldState(delta: number, enemies: Iterable<EnemyShipEntity>): void {
    const buildup = this.thrusterConfig.buildupSeconds;
    for (const enemy of enemies) {
      for (const key of THRUSTER_NAMES) {
        enemy.thrusterState.holdTime[key] = enemy.thrusterState.inputState[key]
          ? Math.min(enemy.thrusterState.holdTime[key] + delta, buildup)
          : 0;
      }
    }
  }

  private emitPlayerThrusterParticles(
    name: ThrusterName,
    context: ThrusterParticleUpdateContext,
  ): void {
    if (!context.player || !context.playerThrusterInputState[name]) {
      this.playerEmissionCarry[name] = 0;
      return;
    }

    const intensity = this.getPlayerThrusterIntensity(name);
    let emissionRate = THREE.MathUtils.lerp(
      this.thrusterConfig.minParticlesPerSecond,
      this.thrusterConfig.maxParticlesPerSecond,
      intensity,
    );
    emissionRate *= this.getThrusterEmissionMultiplier(name, context.afterburnerRamp);
    this.playerEmissionCarry[name] += emissionRate * context.delta;
    const emissionCount = Math.floor(this.playerEmissionCarry[name]);
    this.playerEmissionCarry[name] -= emissionCount;

    const emitter = this.getThrusterEmitter(context.player, name);
    for (let count = 0; count < emissionCount; count += 1) {
      this.spawnThrusterParticle(
        context.player,
        emitter,
        intensity,
        this.getThrusterLengthMultiplier(name, context.afterburnerRamp),
        context.afterburnerRamp,
      );
    }
  }

  private emitEnemyThrusterParticles(
    enemy: EnemyShipEntity,
    name: ThrusterName,
    delta: number,
  ): void {
    if (!enemy.thrusterState.inputState[name]) {
      enemy.thrusterState.emissionCarry[name] = 0;
      return;
    }

    const intensity = this.getEnemyThrusterIntensity(enemy, name);
    const emissionRate = THREE.MathUtils.lerp(
      this.thrusterConfig.minParticlesPerSecond,
      this.thrusterConfig.maxParticlesPerSecond,
      intensity,
    );
    enemy.thrusterState.emissionCarry[name] += emissionRate * delta;
    const emissionCount = Math.floor(enemy.thrusterState.emissionCarry[name]);
    enemy.thrusterState.emissionCarry[name] -= emissionCount;

    const emitter = this.getThrusterEmitter(enemy, name);
    for (let count = 0; count < emissionCount; count += 1) {
      this.spawnThrusterParticle(enemy, emitter, intensity, 1, 0);
    }
  }

  private getPlayerThrusterIntensity(name: ThrusterName): number {
    return THREE.MathUtils.clamp(
      this.playerHoldTime[name] / this.thrusterConfig.buildupSeconds,
      0,
      1,
    );
  }

  private getEnemyThrusterIntensity(enemy: EnemyShipEntity, name: ThrusterName): number {
    return THREE.MathUtils.clamp(
      enemy.thrusterState.holdTime[name] / this.thrusterConfig.buildupSeconds,
      0,
      1,
    );
  }

  private getThrusterEmissionMultiplier(name: ThrusterName, afterburnerRamp: number): number {
    if (name !== "forward") {
      return 1;
    }

    return THREE.MathUtils.lerp(
      1,
      this.afterburnerConfig.particleDensityMultiplier,
      afterburnerRamp,
    );
  }

  private getThrusterLengthMultiplier(name: ThrusterName, afterburnerRamp: number): number {
    if (name !== "forward") {
      return 1;
    }

    return THREE.MathUtils.lerp(
      1,
      this.afterburnerConfig.particleLengthMultiplier,
      afterburnerRamp,
    );
  }

  private getThrusterEmitter(ship: ShipEntity, name: ThrusterName): ThrusterEmitter {
    const forward = new THREE.Vector3(Math.sin(ship.yaw), 0, Math.cos(ship.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const up = new THREE.Vector3(0, 1, 0);
    const visualScale = ship.type === "player" ? this.playerVisualScale : ship.definition.visualScale;
    const forwardOffset = this.thrusterConfig.forwardOffset * visualScale;
    const forwardSideOffset = this.thrusterConfig.forwardSideOffset * visualScale;
    const reverseOffset = this.thrusterConfig.reverseOffset * visualScale;
    const reverseSideOffset = this.thrusterConfig.reverseSideOffset * visualScale;
    const sideOffset = this.thrusterConfig.sideOffset * visualScale;
    const sideForwardOffset = this.thrusterConfig.sideForwardOffset * visualScale;

    if (name === "forward") {
      return {
        position:
          Math.random() < 0.5
            ? ship.position
                .clone()
                .add(forward.clone().multiplyScalar(forwardOffset))
                .add(right.clone().multiplyScalar(forwardSideOffset))
            : ship.position
                .clone()
                .add(forward.clone().multiplyScalar(forwardOffset))
                .add(right.clone().multiplyScalar(-forwardSideOffset)),
        direction: forward.clone().multiplyScalar(-1),
        tangent: right,
        normal: up,
        name,
      };
    }

    if (name === "reverse") {
      return {
        position:
          Math.random() < 0.5
            ? ship.position
                .clone()
                .add(forward.clone().multiplyScalar(reverseOffset))
                .add(right.clone().multiplyScalar(reverseSideOffset))
            : ship.position
                .clone()
                .add(forward.clone().multiplyScalar(reverseOffset))
                .add(right.clone().multiplyScalar(-reverseSideOffset)),
        direction: forward.clone(),
        tangent: right,
        normal: up,
        name,
      };
    }

    if (name === "left") {
      return {
        position: ship.position
          .clone()
          .add(right.clone().multiplyScalar(-sideOffset))
          .add(forward.clone().multiplyScalar(sideForwardOffset)),
        direction: right.clone().multiplyScalar(-1),
        tangent: forward,
        normal: up,
        name,
      };
    }

    return {
      position: ship.position
        .clone()
        .add(right.clone().multiplyScalar(sideOffset))
        .add(forward.clone().multiplyScalar(sideForwardOffset)),
      direction: right.clone(),
      tangent: forward,
      normal: up,
      name,
    };
  }

  private spawnThrusterParticle(
    ship: ShipEntity,
    emitter: ThrusterEmitter,
    intensity: number,
    lengthMultiplier: number,
    afterburnerRamp: number,
  ): void {
    const particle = this.particlePool.find((candidate) => !candidate.active);
    if (!particle) {
      return;
    }

    const lifetime = THREE.MathUtils.lerp(
      this.thrusterConfig.minLifetimeSeconds,
      this.thrusterConfig.maxLifetimeSeconds,
      intensity,
    ) * lengthMultiplier;
    const speed = THREE.MathUtils.lerp(
      this.thrusterConfig.minSpeed,
      this.thrusterConfig.maxSpeed,
      intensity,
    ) * lengthMultiplier;
    const spread = THREE.MathUtils.lerp(
      this.thrusterConfig.minSpread,
      this.thrusterConfig.maxSpread,
      intensity,
    );
    const spawnJitter = this.thrusterConfig.spawnJitter;
    const tangentOffset = (Math.random() * 2 - 1) * spawnJitter;
    const normalOffset = (Math.random() * 2 - 1) * spawnJitter;
    const lateralVelocity = (Math.random() * 2 - 1) * spread;
    const verticalVelocity = (Math.random() * 2 - 1) * spread * 0.35;
    const afterburnerWhiteness =
      ship.type === "player" && emitter.name === "forward"
        ? THREE.MathUtils.lerp(0, 0.7, afterburnerRamp)
        : 0;

    particle.active = true;
    particle.age = 0;
    particle.lifetime = lifetime * (0.85 + Math.random() * 0.3);
    particle.whiteness = afterburnerWhiteness;
    particle.position
      .copy(emitter.position)
      .addScaledVector(emitter.tangent, tangentOffset)
      .addScaledVector(emitter.normal, normalOffset);
    particle.velocity
      .copy(ship.velocity)
      .addScaledVector(emitter.direction, speed * (0.85 + Math.random() * 0.3))
      .addScaledVector(emitter.tangent, lateralVelocity)
      .addScaledVector(emitter.normal, verticalVelocity);
  }

  private syncParticleGeometry(): void {
    for (let index = 0; index < this.particlePool.length; index += 1) {
      const particle = this.particlePool[index];
      const offset = index * 3;
      if (!particle.active) {
        this.particlePositions[offset] = 0;
        this.particlePositions[offset + 1] = -9999;
        this.particlePositions[offset + 2] = 0;
        continue;
      }

      const lifeAlpha = 1 - particle.age / particle.lifetime;
      this.particlePositions[offset] = particle.position.x;
      this.particlePositions[offset + 1] = particle.position.y;
      this.particlePositions[offset + 2] = particle.position.z;
      const baseGreen = THREE.MathUtils.lerp(0.25, 0.8, lifeAlpha);
      const baseBlue = THREE.MathUtils.lerp(0.02, 0.18, lifeAlpha);
      this.particleColors[offset] = 1;
      this.particleColors[offset + 1] = THREE.MathUtils.lerp(
        baseGreen,
        0.96,
        particle.whiteness,
      );
      this.particleColors[offset + 2] = THREE.MathUtils.lerp(
        baseBlue,
        0.72,
        particle.whiteness,
      );
    }

    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
