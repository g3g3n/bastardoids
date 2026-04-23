import * as THREE from "three";
import type {
  AsteroidEntity,
  AsteroidSize,
  CollisionBody,
  PlayerLines,
  ProjectileEntity,
  PlayerShield,
  PlayerState,
  ReferenceGridBounds,
  ThrusterEmitter,
  ThrusterName,
  ThrusterParticle,
  ThrusterStateMap,
} from "./types";
import { CameraRig } from "./camera/CameraRig";
import { loadGameConfig } from "./config";
import { getAsteroidDefinition } from "./entities/asteroids/asteroidDefinitions";
import { getWeaponDefinition } from "./entities/projectiles/weaponDefinitions";
import { createPlayer } from "./player/createPlayer";
import { GameUi } from "./ui/GameUi";
import { BackgroundStars } from "./visuals/BackgroundStars";
import { ReferenceGrid } from "./visuals/ReferenceGrid";
import { createWeaponProjectileMesh } from "./visuals/Weapons";
import { WorldScenery } from "./visuals/WorldScenery";

const config = loadGameConfig();
const STORAGE_KEY = "bastardoids-highscore";
const THRUSTER_NAMES: ThrusterName[] = ["forward", "reverse", "left", "right"];

class BastardoidsApp {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  ui: GameUi;
  cameraRig = new CameraRig(config.world);
  camera = this.cameraRig.camera;
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  pointerNdc = new THREE.Vector2(0, 0);
  cameraFocus = this.cameraRig.focus;
  cameraTarget = this.cameraRig.target;
  cameraVelocity = this.cameraRig.velocity;
  pointerWorld = new THREE.Vector3();
  keys = new Set<string>();
  asteroids = new Map<number, AsteroidEntity>();
  projectiles = new Map<number, ProjectileEntity>();
  referenceGrid = new ReferenceGrid(config.world);
  backgroundStars = new BackgroundStars(config.world);
  worldScenery = new WorldScenery();
  viewport = new THREE.Vector2();
  world = config.world;
  playerConfig = config.player;
  weaponConfig = getWeaponDefinition(this.playerConfig.primaryWeapon);
  spawnConfig = config.spawning;
  physicsConfig = config.physics;
  thrusterConfig = config.thrusters;
  afterburnerConfig = config.afterburner;
  thrusterPoints: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
  thrusterParticlePool: ThrusterParticle[] = [];
  thrusterParticlePositions: Float32Array | null = null;
  thrusterParticleColors: Float32Array | null = null;
  thrusterEmissionCarry: ThrusterStateMap<number> = {
    forward: 0,
    reverse: 0,
    left: 0,
    right: 0,
  };
  thrusterHoldTime: ThrusterStateMap<number> = {
    forward: 0,
    reverse: 0,
    left: 0,
    right: 0,
  };
  thrusterInputState: ThrusterStateMap<boolean> = {
    forward: false,
    reverse: false,
    left: false,
    right: false,
  };
  player: PlayerState | null = null;
  playerLines: PlayerLines | null = null;
  playerShield: PlayerShield | null = null;
  nextId = 1;
  score = 0;
  highScore = this.loadHighScore();
  lives = this.playerConfig.lives;
  lastShotAt = -Infinity;
  spawnCooldown = 0;
  elapsed = 0;
  running = false;
  afterburnerCharge = this.afterburnerConfig.maxDurationSeconds;
  afterburnerActive = false;
  afterburnerShiftHeld = false;
  afterburnerEffectTime = 0;
  currentSpeedCap = this.playerConfig.maxSpeed;

  constructor(container: HTMLElement) {
    this.ui = new GameUi(container);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.ui.attachRenderer(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x02050c);

    this.setupScene();
    this.bindEvents();
    this.updateHud();
    this.updateMenu("Start");
    this.onResize();
    this.animate();
  }

  setupScene(): void {
    const ambient = new THREE.AmbientLight(0x8fb2ff, 0.7);
    const directional = new THREE.DirectionalLight(0xbad7ff, 1.2);
    directional.position.set(30, 60, 20);
    this.scene.add(ambient, directional);

    this.scene.add(this.referenceGrid.root);
    this.scene.add(this.backgroundStars.root);
    this.scene.add(this.worldScenery.root);

    this.setupThrusterParticles();
  }

  setupThrusterParticles(): void {
    const maxParticles = this.thrusterConfig.maxParticles;
    const geometry = new THREE.BufferGeometry();
    this.thrusterParticlePositions = new Float32Array(maxParticles * 3);
    this.thrusterParticleColors = new Float32Array(maxParticles * 3);

    for (let index = 0; index < maxParticles; index += 1) {
      const offset = index * 3;
      this.thrusterParticlePositions[offset] = 0;
      this.thrusterParticlePositions[offset + 1] = -9999;
      this.thrusterParticlePositions[offset + 2] = 0;
      this.thrusterParticleColors[offset] = 1;
      this.thrusterParticleColors[offset + 1] = 0.65;
      this.thrusterParticleColors[offset + 2] = 0.2;
      this.thrusterParticlePool.push({
        active: false,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: 0,
        lifetime: 0,
      });
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(this.thrusterParticlePositions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.thrusterParticleColors, 3));

    const material = new THREE.PointsMaterial({
      size: this.thrusterConfig.particleSize,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.thrusterPoints = new THREE.Points(geometry, material);
    this.thrusterPoints.frustumCulled = false;
    this.scene.add(this.thrusterPoints);
  }

  bindEvents(): void {
    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    this.ui.onStart(() => this.startGame());
    this.ui.onQuit(() => this.quitToMenu());
  }

  onResize = (): void => {
    this.viewport.set(window.innerWidth, window.innerHeight);
    this.cameraRig.resize(this.viewport, this.renderer);
    this.updateCrosshairPosition();

    if (this.player) {
      this.updateCamera(0, true);
    }
  };

  onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.key.toLowerCase());

    if (event.code === "Space") {
      event.preventDefault();
      this.tryFirePrimaryWeapon();
    }

    if (!this.running && event.key === "Enter") {
      this.startGame();
    }
  };

  onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };

  onMouseMove = (event: MouseEvent): void => {
    this.pointerNdc.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointerNdc.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.ui.setCrosshairClientPosition(event.clientX, event.clientY);
    this.updatePointerWorld();
  };

  onMouseDown = (): void => {
    if (this.running) {
      this.tryFirePrimaryWeapon();
    }
  };

  startGame(): void {
    this.running = true;
    this.score = 0;
    this.lives = this.playerConfig.lives;
    this.elapsed = 0;
    this.lastShotAt = -Infinity;
    this.spawnCooldown = 0;
    this.afterburnerCharge = this.afterburnerConfig.maxDurationSeconds;
    this.afterburnerActive = false;
    this.afterburnerShiftHeld = false;
    this.afterburnerEffectTime = 0;
    this.currentSpeedCap = this.playerConfig.maxSpeed;
    this.clearEntities();
    this.createPlayer();
    this.updateHud();
    this.ui.hideMenu();
    this.clock.start();
  }

  quitToMenu(): void {
    this.running = false;
    this.clearEntities();
    this.updateMenu("Start");
  }

  gameOver(): void {
    this.running = false;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem(STORAGE_KEY, String(this.highScore));
    }

    this.updateMenu("Restart", `Game over. Final score: ${this.score}.`);
  }

  updateMenu(buttonLabel: string, copy?: string): void {
    this.ui.setMenuState(buttonLabel, this.highScore, copy);
  }

  createPlayer(): void {
    const createdPlayer = createPlayer(this.playerConfig, this.nextId++);
    this.player = createdPlayer.player;
    this.playerLines = createdPlayer.playerLines;
    this.playerShield = createdPlayer.playerShield;
    this.scene.add(this.player.mesh);

    this.cameraFocus.set(0, 0, 0);
    this.cameraTarget.set(0, 0, 0);
    this.cameraVelocity.set(0, 0, 0);
    this.updateCamera(0, true);
    this.updatePointerWorld();
  }

  createAsteroid(
    size: AsteroidSize,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
  ): AsteroidEntity {
    const asteroidCfg = getAsteroidDefinition(size);
    const geometry = this.buildAsteroidGeometry(size === "large" ? 18 : 13, asteroidCfg.radius);
    const material = new THREE.LineBasicMaterial({
      color: size === "large" ? 0xaed4ff : 0x7ab4ff,
    });
    const mesh = new THREE.LineSegments(geometry, material);
    mesh.position.copy(position);

    const asteroid: AsteroidEntity = {
      id: this.nextId++,
      type: "asteroid",
      size,
      mass: asteroidCfg.mass,
      radius: asteroidCfg.radius,
      maxHealth: asteroidCfg.maxHealth,
      health: asteroidCfg.maxHealth,
      mesh,
      position: position.clone(),
      velocity: velocity.clone(),
      rotationAxis: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
      rotationSpeed:
        asteroidCfg.rotationSpeedMin +
        Math.random() * (asteroidCfg.rotationSpeedMax - asteroidCfg.rotationSpeedMin),
      alive: true,
    };

    this.asteroids.set(asteroid.id, asteroid);
    this.scene.add(mesh);
    return asteroid;
  }

  createProjectile(position: THREE.Vector3, velocity: THREE.Vector3): ProjectileEntity {
    const mesh = createWeaponProjectileMesh(this.weaponConfig);
    mesh.position.copy(position);
    mesh.rotation.y = Math.atan2(velocity.x, velocity.z);

    const projectile: ProjectileEntity = {
      id: this.nextId++,
      type: "projectile",
      weapon: this.weaponConfig.name,
      mass: this.weaponConfig.mass,
      damage: this.weaponConfig.damage,
      radius: this.weaponConfig.radius,
      mesh,
      position: position.clone(),
      velocity: velocity.clone(),
      expiresAt: this.elapsed + this.weaponConfig.lifetimeSeconds,
      alive: true,
    };

    this.projectiles.set(projectile.id, projectile);
    this.scene.add(mesh);
    return projectile;
  }

  buildAsteroidGeometry(pointCount: number, radius: number): THREE.BufferGeometry {
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < pointCount; index += 1) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      )
        .normalize()
        .multiplyScalar(radius * (0.65 + Math.random() * 0.45));
      points.push(dir);
    }

    const segments: number[] = [];
    for (let index = 0; index < pointCount; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % pointCount];
      const across = points[(index + 5) % pointCount];
      segments.push(...current.toArray(), ...next.toArray());
      segments.push(...current.toArray(), ...across.toArray());
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(segments, 3));
    return geometry;
  }

  tryFirePrimaryWeapon(): void {
    if (!this.running || !this.player) {
      return;
    }

    const minDelay = 1 / this.weaponConfig.shotsPerSecond;
    if (this.elapsed - this.lastShotAt < minDelay) {
      return;
    }

    this.lastShotAt = this.elapsed;

    const forward = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const baseVelocity = this.player.velocity
      .clone()
      .add(forward.clone().multiplyScalar(this.weaponConfig.speed));
    const muzzleForward = forward.clone().multiplyScalar(this.playerConfig.muzzleOffsetForward);

    if (this.weaponConfig.name === "plasmaOrb") {
      this.createProjectile(this.player.position.clone().add(muzzleForward), baseVelocity);
      return;
    }

    const sideOffset = right.clone().multiplyScalar(this.playerConfig.muzzleOffsetSide);

    this.createProjectile(
      this.player.position.clone().add(muzzleForward).add(sideOffset),
      baseVelocity.clone(),
    );
    this.createProjectile(
      this.player.position.clone().add(muzzleForward).sub(sideOffset),
      baseVelocity.clone(),
    );
  }

  animate = (): void => {
    requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta() || 0.016, 0.033);
    if (this.running) {
      this.elapsed += delta;
      this.step(delta);
    }

    this.renderer.render(this.scene, this.camera);
  };

  step(delta: number): void {
    this.handleInput(delta);
    this.updateAfterburner(delta);
    this.spawnCooldown -= delta;
    if (this.spawnCooldown <= 0) {
      this.spawnAsteroid();
      this.spawnCooldown = this.getNextSpawnDelay();
    }

    this.integratePlayer(delta);
    this.updateThrusterParticles(delta);
    this.integrateAsteroids(delta);
    this.integrateProjectiles(delta);
    this.handleProjectileHits();
    this.handleObjectCollisions();
    this.cleanupFarObjects();
    this.updateCamera(delta, false);
    this.updateHud();

    if (this.playerLines && this.player) {
      const shipMaterial = this.playerLines.material;
      if (this.player.invulnerableUntil > this.elapsed) {
        shipMaterial.color.setHex(
          Math.floor((Math.sin(this.elapsed * 24) * 0.5 + 0.5) * 0x55) + 0xaaffaa,
        );
      } else {
        shipMaterial.color.setHex(0xffffff);
      }
    }

    this.updateShieldEffect();
  }

  handleInput(delta: number): void {
    if (!this.player) {
      return;
    }

    const thrustingForward = this.keys.has("w");
    const thrustingReverse = this.keys.has("s");
    const strafingLeft = this.keys.has("a");
    const strafingRight = this.keys.has("d");
    const shiftHeld = this.keys.has("shift");
    const forward = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const afterburnerEngaged = this.isAfterburnerEngaged(shiftHeld, thrustingForward);
    const boostedSpeedCap =
      this.playerConfig.maxSpeed * this.afterburnerConfig.maxSpeedMultiplier;
    const decayPerSecond =
      (boostedSpeedCap - this.playerConfig.maxSpeed) /
      this.afterburnerConfig.disengageDecaySeconds;
    if (afterburnerEngaged) {
      this.currentSpeedCap = boostedSpeedCap;
    } else {
      this.currentSpeedCap = Math.max(
        this.playerConfig.maxSpeed,
        this.currentSpeedCap - decayPerSecond * delta,
      );
    }
    const activeSpeedCap = this.currentSpeedCap;
    const forwardThrust =
      this.playerConfig.thrust *
      (afterburnerEngaged ? this.afterburnerConfig.thrustMultiplier : 1);

    this.thrusterInputState.forward = thrustingForward;
    this.thrusterInputState.reverse = thrustingReverse;
    this.thrusterInputState.left = strafingLeft;
    this.thrusterInputState.right = strafingRight;
    this.afterburnerShiftHeld = shiftHeld;
    this.afterburnerActive = afterburnerEngaged;

    if (thrustingForward) {
      this.player.velocity.addScaledVector(forward, forwardThrust * delta);
    }

    if (thrustingReverse) {
      this.player.velocity.addScaledVector(forward, -this.playerConfig.reverseThrust * delta);
    }

    if (strafingLeft) {
      this.applyAxisThrust(
        right,
        this.playerConfig.strafeThrust * delta,
        this.playerConfig.strafeMaxSpeed,
      );
    }

    if (strafingRight) {
      this.applyAxisThrust(
        right,
        -this.playerConfig.strafeThrust * delta,
        this.playerConfig.strafeMaxSpeed,
      );
    }

    const speed = this.player.velocity.length();
    if (speed > activeSpeedCap) {
      this.player.velocity.setLength(activeSpeedCap);
    }

    this.updatePointerWorld();
    const toPointer = this.pointerWorld.clone().sub(this.player.position);
    if (toPointer.lengthSq() > 0.001) {
      const targetYaw = Math.atan2(toPointer.x, toPointer.z);
      const difference = this.wrapAngle(targetYaw - this.player.yaw);
      this.player.yawVelocity += difference * this.playerConfig.turnRate * delta;
      this.player.yawVelocity *= Math.exp(-this.playerConfig.turnDamping * delta);
      this.player.yaw += this.player.yawVelocity * delta;
      this.player.mesh.rotation.y = this.player.yaw;
    }
  }

  integratePlayer(delta: number): void {
    if (!this.player) {
      return;
    }

    this.player.position.addScaledVector(this.player.velocity, delta);
    this.player.mesh.position.copy(this.player.position);
  }

  updateThrusterParticles(delta: number): void {
    this.updateThrusterHoldState(delta);

    for (const particle of this.thrusterParticlePool) {
      if (!particle.active) {
        continue;
      }

      particle.age += delta;
      if (particle.age >= particle.lifetime) {
        particle.active = false;
        continue;
      }

      particle.position.addScaledVector(particle.velocity, delta);
    }

    if (this.player) {
      this.emitThrusterParticles("forward", delta);
      this.emitThrusterParticles("reverse", delta);
      this.emitThrusterParticles("left", delta);
      this.emitThrusterParticles("right", delta);
    }

    this.syncThrusterParticleGeometry();
  }

  integrateAsteroids(delta: number): void {
    for (const asteroid of this.asteroids.values()) {
      asteroid.position.addScaledVector(asteroid.velocity, delta);
      asteroid.mesh.position.copy(asteroid.position);
      asteroid.mesh.rotateOnAxis(asteroid.rotationAxis, asteroid.rotationSpeed * delta);
    }
  }

  integrateProjectiles(delta: number): void {
    for (const projectile of [...this.projectiles.values()]) {
      projectile.position.addScaledVector(projectile.velocity, delta);
      projectile.mesh.position.copy(projectile.position);
      projectile.mesh.rotation.y = Math.atan2(projectile.velocity.x, projectile.velocity.z);

      if (this.elapsed >= projectile.expiresAt) {
        this.destroyProjectile(projectile);
      }
    }
  }

  handleProjectileHits(): void {
    for (const projectile of [...this.projectiles.values()]) {
      for (const asteroid of [...this.asteroids.values()]) {
        if (!projectile.alive || !asteroid.alive) {
          continue;
        }

        const hitDistance = projectile.radius + asteroid.radius;
        if (projectile.position.distanceToSquared(asteroid.position) > hitDistance * hitDistance) {
          continue;
        }

        this.applyProjectileImpact(projectile, asteroid);
        this.destroyProjectile(projectile);
        asteroid.health -= projectile.damage;
        if (asteroid.health <= 0) {
          if (asteroid.size === "small") {
            this.destroyAsteroid(asteroid);
            this.score += 1;
          } else {
            this.splitLargeAsteroid(asteroid);
          }
        }
        break;
      }
    }
  }

  applyProjectileImpact(projectile: ProjectileEntity, asteroid: AsteroidEntity): void {
    const combinedMass = asteroid.mass + projectile.mass;
    if (combinedMass <= 0) {
      return;
    }

    // Treat projectile hits as a partially inelastic impact so weapon mass and speed
    // both contribute to nudging asteroid heading without producing extreme ricochets.
    const postImpactVelocity = asteroid.velocity
      .clone()
      .multiplyScalar(asteroid.mass)
      .addScaledVector(projectile.velocity, projectile.mass)
      .multiplyScalar(1 / combinedMass);
    asteroid.velocity.copy(postImpactVelocity);

    const impactOffset = projectile.position.clone().sub(asteroid.position).setY(0);
    if (impactOffset.lengthSq() > 0.0001) {
      const tangent = new THREE.Vector3(-impactOffset.z, 0, impactOffset.x).normalize();
      const tangentialSpeed = projectile.velocity.dot(tangent);
      const spinImpulse = (tangentialSpeed * projectile.mass) / Math.max(asteroid.mass * asteroid.radius, 0.001);
      asteroid.rotationSpeed += THREE.MathUtils.clamp(spinImpulse, -1.5, 1.5);
    }
  }

  handleObjectCollisions(): void {
    if (!this.player) {
      return;
    }

    const dynamicObjects: CollisionBody[] = [this.player, ...this.asteroids.values()];
    for (let firstIndex = 0; firstIndex < dynamicObjects.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < dynamicObjects.length; secondIndex += 1) {
        const first = dynamicObjects[firstIndex];
        const second = dynamicObjects[secondIndex];
        if (!first.alive || !second.alive) {
          continue;
        }

        const delta = second.position.clone().sub(first.position);
        delta.y = 0;
        const minDistance = first.radius + second.radius;
        const distanceSq = delta.lengthSq();
        if (distanceSq === 0 || distanceSq > minDistance * minDistance) {
          continue;
        }

        const distance = Math.sqrt(distanceSq);
        const normal = delta.multiplyScalar(1 / distance);
        const relativeVelocity = second.velocity.clone().sub(first.velocity);
        const separatingSpeed = relativeVelocity.dot(normal);

        if (separatingSpeed < 0) {
          const impulseMagnitude =
            (-(1 + this.physicsConfig.restitution) * separatingSpeed) /
            (1 / first.mass + 1 / second.mass);
          const impulse = normal.clone().multiplyScalar(impulseMagnitude);
          first.velocity.addScaledVector(impulse, -1 / first.mass);
          second.velocity.addScaledVector(impulse, 1 / second.mass);
        }

        const overlap = minDistance - distance + this.physicsConfig.separationBias;
        const correction = normal
          .clone()
          .multiplyScalar(overlap / (1 / first.mass + 1 / second.mass));
        first.position.addScaledVector(correction, -1 / first.mass);
        second.position.addScaledVector(correction, 1 / second.mass);
        first.mesh.position.copy(first.position);
        second.mesh.position.copy(second.position);

        const playerHit =
          (first.type === "player" && second.type === "asteroid") ||
          (first.type === "asteroid" && second.type === "player");
        if (playerHit) {
          this.handlePlayerAsteroidHit();
        }
      }
    }
  }

  handlePlayerAsteroidHit(): void {
    if (!this.player || this.player.invulnerableUntil > this.elapsed) {
      return;
    }

    this.player.invulnerableUntil = this.elapsed + this.playerConfig.invulnerabilitySeconds;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.gameOver();
    }
  }

  splitLargeAsteroid(asteroid: AsteroidEntity): void {
    const baseDirection = asteroid.velocity.clone().normalize();
    const lateral = new THREE.Vector3(-baseDirection.z, 0, baseDirection.x);
    const speed = asteroid.velocity.length();

    this.createAsteroid(
      "small",
      asteroid.position.clone().add(lateral.clone().multiplyScalar(1.2)),
      baseDirection
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 5)
        .multiplyScalar(speed * 1.1),
    );
    this.createAsteroid(
      "small",
      asteroid.position.clone().add(lateral.clone().multiplyScalar(-1.2)),
      baseDirection
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 5)
        .multiplyScalar(speed * 1.05),
    );

    this.destroyAsteroid(asteroid);
  }

  spawnAsteroid(): void {
    if (!this.player) {
      return;
    }

    const cameraForward = new THREE.Vector3()
      .subVectors(this.camera.position, this.cameraFocus)
      .setY(0)
      .normalize();
    const cameraRight = new THREE.Vector3(cameraForward.z, 0, -cameraForward.x);
    const spawnBounds = this.getPlayerBounds(this.world.asteroidDistanceScreens);
    const spawnSide = Math.floor(Math.random() * 4);
    const along = (Math.random() - 0.5) * 2;
    const center = this.player.position.clone();
    const spawnPosition = center.clone();

    if (spawnSide === 0) {
      spawnPosition.addScaledVector(cameraRight, spawnBounds.halfWidth * along);
      spawnPosition.addScaledVector(cameraForward, spawnBounds.halfDepth);
    } else if (spawnSide === 1) {
      spawnPosition.addScaledVector(cameraRight, spawnBounds.halfWidth * along);
      spawnPosition.addScaledVector(cameraForward, -spawnBounds.halfDepth);
    } else if (spawnSide === 2) {
      spawnPosition.addScaledVector(cameraForward, spawnBounds.halfDepth * along);
      spawnPosition.addScaledVector(cameraRight, spawnBounds.halfWidth);
    } else {
      spawnPosition.addScaledVector(cameraForward, spawnBounds.halfDepth * along);
      spawnPosition.addScaledVector(cameraRight, -spawnBounds.halfWidth);
    }

    const size = Math.random() < 0.45 ? "large" : "small";
    const asteroidCfg = getAsteroidDefinition(size);
    const toCenter = center.clone().sub(spawnPosition).setY(0).normalize();
    const angleOffset = (Math.random() - 0.5) * (Math.PI / 2.2);
    const velocity = toCenter
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset)
      .multiplyScalar(
        asteroidCfg.minSpeed + Math.random() * (asteroidCfg.maxSpeed - asteroidCfg.minSpeed),
      );

    this.createAsteroid(size, spawnPosition, velocity);
  }

  cleanupFarObjects(): void {
    if (!this.player) {
      return;
    }

    const bounds = this.getPlayerBounds(this.world.asteroidDistanceScreens);
    for (const asteroid of [...this.asteroids.values()]) {
      if (this.isOutsidePlayerBounds(asteroid.position, bounds)) {
        this.destroyAsteroid(asteroid);
      }
    }

    for (const projectile of [...this.projectiles.values()]) {
      if (this.isOutsidePlayerBounds(projectile.position, bounds)) {
        this.destroyProjectile(projectile);
      }
    }
  }

  updateCamera(delta: number, force: boolean): void {
    this.cameraRig.update(this.player, delta, force);
    const viewBounds = this.cameraRig.getViewBounds();
    this.referenceGrid.refresh(this.cameraFocus, viewBounds, force);
    this.backgroundStars.refresh(this.cameraFocus, viewBounds, force);
  }

  updatePointerWorld(): void {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    this.raycaster.ray.intersectPlane(this.plane, this.pointerWorld);
  }

  updateCrosshairPosition(): void {
    this.ui.updateCrosshairPosition(this.pointerNdc, this.viewport);
  }

  updateHud(): void {
    this.ui.updateHud({
      score: this.score,
      lives: this.lives,
      running: this.running,
      invulnerable: !!this.player && this.player.invulnerableUntil > this.elapsed,
      highScore: this.highScore,
      velocityX: this.player ? this.player.velocity.x : 0,
      velocityZ: this.player ? this.player.velocity.z : 0,
    });
    this.ui.updateAfterburner({
      charge: this.afterburnerCharge,
      maxCharge: this.afterburnerConfig.maxDurationSeconds,
      active: this.afterburnerActive,
      cooling: !this.afterburnerActive && !this.afterburnerShiftHeld,
    });
  }

  destroyAsteroid(asteroid: AsteroidEntity): void {
    asteroid.alive = false;
    this.asteroids.delete(asteroid.id);
    this.scene.remove(asteroid.mesh);
  }

  destroyProjectile(projectile: ProjectileEntity): void {
    projectile.alive = false;
    this.projectiles.delete(projectile.id);
    this.scene.remove(projectile.mesh);
  }

  clearEntities(): void {
    for (const asteroid of this.asteroids.values()) {
      this.scene.remove(asteroid.mesh);
    }
    for (const projectile of this.projectiles.values()) {
      this.scene.remove(projectile.mesh);
    }
    this.asteroids.clear();
    this.projectiles.clear();

    if (this.player) {
      this.scene.remove(this.player.mesh);
    }
    this.player = null;
    this.playerLines = null;
    this.playerShield = null;
    this.resetThrusterParticles();
  }

  getNextSpawnDelay(): number {
    const rateIncreaseSteps = Math.floor(this.elapsed / this.spawnConfig.increaseEverySeconds);
    const asteroidsPerEight =
      this.spawnConfig.basePerEightSeconds +
      rateIncreaseSteps * this.spawnConfig.increasePerEightSeconds;
    const baseDelay = 8 / asteroidsPerEight;
    return Math.max(0.35, baseDelay + (Math.random() * 2 - 1) * this.spawnConfig.jitterSeconds);
  }

  getWorldViewHeight(): number {
    return this.cameraRig.getWorldViewHeight();
  }

  getCameraHeight(): number {
    return this.cameraRig.getCameraHeight();
  }

  getCameraLookDirection(): THREE.Vector3 {
    return this.player ? this.cameraRig.getLookDirection(this.player) : new THREE.Vector3(0, 0, -1);
  }

  loadHighScore(): number {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  isAfterburnerEngaged(shiftHeld: boolean, thrustingForward: boolean): boolean {
    return shiftHeld && thrustingForward && this.afterburnerCharge > 0.001;
  }

  updateAfterburner(delta: number): void {
    if (this.afterburnerActive) {
      this.afterburnerCharge = Math.max(0, this.afterburnerCharge - delta);
      this.afterburnerEffectTime = Math.min(
        this.afterburnerEffectTime + delta,
        this.afterburnerConfig.particleRampSeconds,
      );
      if (this.afterburnerCharge <= 0) {
        this.afterburnerActive = false;
      }
      return;
    }

    this.afterburnerEffectTime = 0;
    if (!this.afterburnerShiftHeld) {
      const rechargeRate =
        this.afterburnerConfig.maxDurationSeconds / this.afterburnerConfig.rechargeSeconds;
      this.afterburnerCharge = Math.min(
        this.afterburnerConfig.maxDurationSeconds,
        this.afterburnerCharge + rechargeRate * delta,
      );
    }
  }

  updateShieldEffect(): void {
    if (!this.player || !this.playerShield) {
      return;
    }

    const invulnerableTimeLeft = this.player.invulnerableUntil - this.elapsed;
    if (invulnerableTimeLeft <= 0) {
      this.playerShield.visible = false;
      return;
    }

    const shieldMaterial = this.playerShield.material;
    const pulse = Math.sin(this.elapsed * 10) * 0.5 + 0.5;
    this.playerShield.visible = true;
    this.playerShield.scale.setScalar(1 + pulse * 0.06);
    shieldMaterial.opacity = 0.14 + pulse * 0.12;
    shieldMaterial.color.setHex(pulse > 0.5 ? 0x69d8ff : 0x8fffb5);
  }

  updateThrusterHoldState(delta: number): void {
    const buildup = this.thrusterConfig.buildupSeconds;
    for (const key of THRUSTER_NAMES) {
      this.thrusterHoldTime[key] = this.thrusterInputState[key]
        ? Math.min(this.thrusterHoldTime[key] + delta, buildup)
        : 0;
    }
  }

  emitThrusterParticles(name: ThrusterName, delta: number): void {
    if (!this.player || !this.thrusterInputState[name]) {
      this.thrusterEmissionCarry[name] = 0;
      return;
    }

    const intensity = this.getThrusterIntensity(name);
    let emissionRate = THREE.MathUtils.lerp(
      this.thrusterConfig.minParticlesPerSecond,
      this.thrusterConfig.maxParticlesPerSecond,
      intensity,
    );
    emissionRate *= this.getThrusterEmissionMultiplier(name);
    this.thrusterEmissionCarry[name] += emissionRate * delta;
    const emissionCount = Math.floor(this.thrusterEmissionCarry[name]);
    this.thrusterEmissionCarry[name] -= emissionCount;

    const emitter = this.getThrusterEmitter(name);
    for (let count = 0; count < emissionCount; count += 1) {
      this.spawnThrusterParticle(emitter, intensity);
    }
  }

  getThrusterIntensity(name: ThrusterName): number {
    return THREE.MathUtils.clamp(
      this.thrusterHoldTime[name] / this.thrusterConfig.buildupSeconds,
      0,
      1,
    );
  }

  getAfterburnerParticleRamp(): number {
    if (!this.afterburnerActive || this.afterburnerConfig.particleRampSeconds <= 0) {
      return 0;
    }

    return THREE.MathUtils.clamp(
      this.afterburnerEffectTime / this.afterburnerConfig.particleRampSeconds,
      0,
      1,
    );
  }

  getThrusterEmissionMultiplier(name: ThrusterName): number {
    if (name !== "forward") {
      return 1;
    }

    return THREE.MathUtils.lerp(
      1,
      this.afterburnerConfig.particleDensityMultiplier,
      this.getAfterburnerParticleRamp(),
    );
  }

  getThrusterLengthMultiplier(name: ThrusterName): number {
    if (name !== "forward") {
      return 1;
    }

    return THREE.MathUtils.lerp(
      1,
      this.afterburnerConfig.particleLengthMultiplier,
      this.getAfterburnerParticleRamp(),
    );
  }

  getThrusterEmitter(name: ThrusterName): ThrusterEmitter {
    const player = this.player;
    if (!player) {
      throw new Error("Thruster emitter requested without a player.");
    }

    const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const up = new THREE.Vector3(0, 1, 0);

    if (name === "forward") {
      return {
        position:
          Math.random() < 0.5
            ? player.position
                .clone()
                .add(forward.clone().multiplyScalar(this.thrusterConfig.forwardOffset))
                .add(right.clone().multiplyScalar(this.thrusterConfig.forwardSideOffset))
            : player.position
                .clone()
                .add(forward.clone().multiplyScalar(this.thrusterConfig.forwardOffset))
                .add(right.clone().multiplyScalar(-this.thrusterConfig.forwardSideOffset)),
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
            ? player.position
                .clone()
                .add(forward.clone().multiplyScalar(this.thrusterConfig.reverseOffset))
                .add(right.clone().multiplyScalar(this.thrusterConfig.reverseSideOffset))
            : player.position
                .clone()
                .add(forward.clone().multiplyScalar(this.thrusterConfig.reverseOffset))
                .add(right.clone().multiplyScalar(-this.thrusterConfig.reverseSideOffset)),
        direction: forward.clone(),
        tangent: right,
        normal: up,
        name,
      };
    }

    if (name === "left") {
      return {
        position: player.position
          .clone()
          .add(right.clone().multiplyScalar(-this.thrusterConfig.sideOffset))
          .add(forward.clone().multiplyScalar(this.thrusterConfig.sideForwardOffset)),
        direction: right.clone().multiplyScalar(-1),
        tangent: forward,
        normal: up,
        name,
      };
    }

    return {
      position: player.position
        .clone()
        .add(right.clone().multiplyScalar(this.thrusterConfig.sideOffset))
        .add(forward.clone().multiplyScalar(this.thrusterConfig.sideForwardOffset)),
      direction: right.clone(),
      tangent: forward,
      normal: up,
      name,
    };
  }

  spawnThrusterParticle(emitter: ThrusterEmitter, intensity: number): void {
    const player = this.player;
    if (!player) {
      return;
    }

    const particle = this.thrusterParticlePool.find((candidate) => !candidate.active);
    if (!particle) {
      return;
    }

    const lengthMultiplier = this.getThrusterLengthMultiplier(emitter.name);
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

    particle.active = true;
    particle.age = 0;
    particle.lifetime = lifetime * (0.85 + Math.random() * 0.3);
    particle.position
      .copy(emitter.position)
      .addScaledVector(emitter.tangent, tangentOffset)
      .addScaledVector(emitter.normal, normalOffset);
    particle.velocity
      .copy(player.velocity)
      .addScaledVector(emitter.direction, speed * (0.85 + Math.random() * 0.3))
      .addScaledVector(emitter.tangent, lateralVelocity)
      .addScaledVector(emitter.normal, verticalVelocity);
  }

  syncThrusterParticleGeometry(): void {
    if (!this.thrusterPoints || !this.thrusterParticlePositions || !this.thrusterParticleColors) {
      return;
    }

    for (let index = 0; index < this.thrusterParticlePool.length; index += 1) {
      const particle = this.thrusterParticlePool[index];
      const offset = index * 3;
      if (!particle.active) {
        this.thrusterParticlePositions[offset] = 0;
        this.thrusterParticlePositions[offset + 1] = -9999;
        this.thrusterParticlePositions[offset + 2] = 0;
        continue;
      }

      const lifeAlpha = 1 - particle.age / particle.lifetime;
      this.thrusterParticlePositions[offset] = particle.position.x;
      this.thrusterParticlePositions[offset + 1] = particle.position.y;
      this.thrusterParticlePositions[offset + 2] = particle.position.z;
      this.thrusterParticleColors[offset] = 1;
      this.thrusterParticleColors[offset + 1] = THREE.MathUtils.lerp(0.25, 0.8, lifeAlpha);
      this.thrusterParticleColors[offset + 2] = THREE.MathUtils.lerp(0.02, 0.18, lifeAlpha);
    }

    this.thrusterPoints.geometry.attributes.position.needsUpdate = true;
    this.thrusterPoints.geometry.attributes.color.needsUpdate = true;
  }

  resetThrusterParticles(): void {
    for (const key of THRUSTER_NAMES) {
      this.thrusterInputState[key] = false;
      this.thrusterHoldTime[key] = 0;
      this.thrusterEmissionCarry[key] = 0;
    }

    this.afterburnerActive = false;
    this.afterburnerShiftHeld = false;
    this.afterburnerEffectTime = 0;

    for (const particle of this.thrusterParticlePool) {
      particle.active = false;
      particle.age = 0;
      particle.lifetime = 0;
      particle.position.set(0, -9999, 0);
      particle.velocity.set(0, 0, 0);
    }

    this.syncThrusterParticleGeometry();
  }

  applyAxisThrust(axis: THREE.Vector3, deltaSpeed: number, maxAxisSpeed: number): void {
    if (!this.player || deltaSpeed === 0) {
      return;
    }

    const axisSpeed = this.player.velocity.dot(axis);
    const thrustSign = Math.sign(deltaSpeed);
    const axisSign = Math.sign(axisSpeed);

    // Keep existing inertial drift intact; only cap additional thrust
    // when the player is accelerating further along the same local axis.
    if (axisSign !== 0 && axisSign === thrustSign && Math.abs(axisSpeed) >= maxAxisSpeed) {
      return;
    }

    let appliedDelta = deltaSpeed;
    if (axisSign === thrustSign || axisSign === 0) {
      const remainingSpeed = maxAxisSpeed - Math.abs(axisSpeed);
      appliedDelta = thrustSign * Math.min(Math.abs(deltaSpeed), Math.max(remainingSpeed, 0));
    }

    this.player.velocity.addScaledVector(axis, appliedDelta);
  }

  getReferenceGridBounds(): ReferenceGridBounds {
    return this.cameraRig.getViewBounds();
  }

  getPlayerBounds(distanceScreens: number): ReferenceGridBounds {
    const viewBounds = this.getReferenceGridBounds();
    return {
      halfWidth: viewBounds.halfWidth * distanceScreens,
      halfDepth: viewBounds.halfDepth * distanceScreens,
    };
  }

  isOutsidePlayerBounds(position: THREE.Vector3, bounds: ReferenceGridBounds): boolean {
    if (!this.player) {
      return false;
    }

    const deltaX = Math.abs(position.x - this.player.position.x);
    const deltaZ = Math.abs(position.z - this.player.position.z);
    return deltaX > bounds.halfWidth || deltaZ > bounds.halfDepth;
  }

  wrapAngle(angle: number): number {
    let wrapped = angle;
    while (wrapped > Math.PI) {
      wrapped -= Math.PI * 2;
    }
    while (wrapped < -Math.PI) {
      wrapped += Math.PI * 2;
    }
    return wrapped;
  }
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("App root not found.");
}

new BastardoidsApp(app);
