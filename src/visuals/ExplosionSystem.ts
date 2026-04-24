import * as THREE from "three";

export interface ExplosionSpawnOptions {
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  radius: number;
  color: THREE.ColorRepresentation;
}

interface ExplosionShard {
  active: boolean;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  baseScale: THREE.Vector3;
  rotationAxis: THREE.Vector3;
  rotationAngle: number;
  rotationSpeed: number;
  age: number;
  lifetime: number;
}

interface ExplosionFlash {
  active: boolean;
  mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  position: THREE.Vector3;
  baseScale: number;
  age: number;
  lifetime: number;
}

export class ExplosionSystem {
  root = new THREE.Group();

  private readonly maxShards: number;
  private readonly maxFlashes: number;
  private readonly shards: ExplosionShard[] = [];
  private readonly flashes: ExplosionFlash[] = [];
  private readonly hiddenPosition = new THREE.Vector3(0, -9999, 0);
  private nextShardIndex = 0;
  private nextFlashIndex = 0;

  constructor(maxShards = 720, maxFlashes = 48) {
    this.maxShards = maxShards;
    this.maxFlashes = maxFlashes;

    const shardGeometry = new THREE.BoxGeometry(1, 1, 1);
    const flashGeometry = new THREE.OctahedronGeometry(1, 0);

    for (let index = 0; index < this.maxShards; index += 1) {
      const mesh = new THREE.Mesh(
        shardGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.96,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.position.copy(this.hiddenPosition);
      this.root.add(mesh);
      this.shards.push({
        active: false,
        mesh,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        baseScale: new THREE.Vector3(0.3, 0.08, 0.08),
        rotationAxis: new THREE.Vector3(0, 1, 0),
        rotationAngle: 0,
        rotationSpeed: 0,
        age: 0,
        lifetime: 0,
      });
    }

    for (let index = 0; index < this.maxFlashes; index += 1) {
      const mesh = new THREE.Mesh(
        flashGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.position.copy(this.hiddenPosition);
      this.root.add(mesh);
      this.flashes.push({
        active: false,
        mesh,
        position: new THREE.Vector3(),
        baseScale: 1,
        age: 0,
        lifetime: 0,
      });
    }
  }

  spawn(options: ExplosionSpawnOptions): void {
    const radius = Math.max(options.radius, 0.35);
    const sourceVelocity = options.velocity?.clone().setY(0) ?? new THREE.Vector3();
    const shardCount = THREE.MathUtils.clamp(Math.round((12 + radius * 6) * 1.3), 18, 72);
    const burstSpeed = 11 + radius * 6.5;
    const baseScale = Math.max(0.56, radius * 0.4);
    const color = new THREE.Color(options.color);

    for (let count = 0; count < shardCount; count += 1) {
      const index = this.nextShardIndex;
      this.nextShardIndex = (this.nextShardIndex + 1) % this.maxShards;
      const shard = this.shards[index];

      const direction = new THREE.Vector3(
        Math.random() * 2 - 1,
        (Math.random() * 2 - 1) * 0.32,
        Math.random() * 2 - 1,
      );
      if (direction.lengthSq() < 0.0001) {
        direction.set(1, 0, 0);
      }
      direction.normalize();

      shard.active = true;
      shard.age = 0;
      shard.lifetime = 0.6 + radius * 0.07 + Math.random() * 0.35;
      shard.position
        .copy(options.position)
        .addScaledVector(direction, radius * (0.08 + Math.random() * 0.22));
      shard.velocity
        .copy(sourceVelocity)
        .multiplyScalar(0.45)
        .addScaledVector(direction, burstSpeed * (0.55 + Math.random() * 0.95));
      shard.baseScale.set(
        baseScale * (0.7 + Math.random() * 0.9),
        baseScale * (0.14 + Math.random() * 0.26),
        baseScale * (0.14 + Math.random() * 0.26),
      );
      shard.rotationAxis
        .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
        .normalize();
      shard.rotationAngle = Math.random() * Math.PI * 2;
      shard.rotationSpeed = (Math.random() * 2 - 1) * (6 + radius * 1.5);
      shard.mesh.visible = true;
      shard.mesh.material.color.copy(color);
      this.updateShardVisual(shard, 1);
    }

    const flashIndex = this.nextFlashIndex;
    this.nextFlashIndex = (this.nextFlashIndex + 1) % this.maxFlashes;
    const flash = this.flashes[flashIndex];
    flash.active = true;
    flash.position.copy(options.position);
    flash.baseScale = radius * 1.2;
    flash.age = 0;
    flash.lifetime = 0.18 + radius * 0.04;
    flash.mesh.visible = true;
    flash.mesh.material.color.copy(color).offsetHSL(0, 0, 0.18);
    this.updateFlashVisual(flash, 1);
  }

  update(delta: number): void {
    for (const shard of this.shards) {
      if (!shard.active) {
        continue;
      }

      shard.age += delta;
      if (shard.age >= shard.lifetime) {
        this.hideShard(shard);
        continue;
      }

      const lifeAlpha = 1 - shard.age / shard.lifetime;
      shard.position.addScaledVector(shard.velocity, delta);
      shard.velocity.multiplyScalar(Math.exp(-1.45 * delta));
      shard.rotationAngle += shard.rotationSpeed * delta;
      this.updateShardVisual(shard, lifeAlpha);
    }

    for (const flash of this.flashes) {
      if (!flash.active) {
        continue;
      }

      flash.age += delta;
      if (flash.age >= flash.lifetime) {
        this.hideFlash(flash);
        continue;
      }

      const progress = flash.age / flash.lifetime;
      const scaleMultiplier = (1 - progress) * (1.25 + progress * 1.4);
      this.updateFlashVisual(flash, scaleMultiplier);
    }
  }

  clear(): void {
    for (const shard of this.shards) {
      this.hideShard(shard);
    }

    for (const flash of this.flashes) {
      this.hideFlash(flash);
    }
  }

  private updateShardVisual(shard: ExplosionShard, lifeAlpha: number): void {
    shard.mesh.position.copy(shard.position);
    shard.mesh.quaternion.setFromAxisAngle(shard.rotationAxis, shard.rotationAngle);
    shard.mesh.scale.copy(shard.baseScale).multiplyScalar(Math.max(lifeAlpha, 0.001));
    shard.mesh.material.opacity = 0.18 + lifeAlpha * 0.85;
  }

  private updateFlashVisual(flash: ExplosionFlash, scaleMultiplier: number): void {
    flash.mesh.position.copy(flash.position);
    flash.mesh.rotation.set(0, 0, 0);
    flash.mesh.scale.setScalar(Math.max(flash.baseScale * scaleMultiplier, 0.001));
    flash.mesh.material.opacity = Math.max(0, 0.52 * (1 - flash.age / flash.lifetime));
  }

  private hideShard(shard: ExplosionShard): void {
    shard.active = false;
    shard.mesh.visible = false;
    shard.mesh.position.copy(this.hiddenPosition);
    shard.mesh.material.opacity = 0;
  }

  private hideFlash(flash: ExplosionFlash): void {
    flash.active = false;
    flash.mesh.visible = false;
    flash.mesh.position.copy(this.hiddenPosition);
    flash.mesh.material.opacity = 0;
  }
}
