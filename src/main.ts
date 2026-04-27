import * as THREE from "three";
import type {
  AsteroidEntity,
  AsteroidSize,
  CollisionBody,
  DamageableEntity,
  EnemyShipEntity,
  PlayerLines,
  ProjectileEntity,
  PlayerShield,
  PlayerState,
  ReferenceGridBounds,
  ShipControlIntent,
  ShipEntity,
  ThrusterEmitter,
  ThrusterName,
  ThrusterParticle,
  ThrusterStateMap,
} from "./types";
import { updateEnemyAi } from "./ai/enemyShipAi";
import { AudioSystem } from "./audio/AudioSystem";
import { CameraRig } from "./camera/CameraRig";
import { loadGameConfig } from "./config";
import { getAsteroidDefinition } from "./entities/asteroids/asteroidDefinitions";
import { createEnemyShip } from "./entities/enemies/createEnemyShip";
import { getEnemyShipDefinition } from "./entities/enemies/enemyDefinitions";
import { getWeaponDefinition } from "./entities/projectiles/weaponDefinitions";
import { applyShipControl, getShipBasis, wrapAngle } from "./entities/ships/shipController";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { createPlayer } from "./player/createPlayer";
import { GameUi } from "./ui/GameUi";
import { BackgroundStars } from "./visuals/BackgroundStars";
import { ExplosionSystem } from "./visuals/ExplosionSystem";
import { ReferenceGrid } from "./visuals/ReferenceGrid";
import { createWeaponProjectileMesh } from "./visuals/Weapons";
import { WorldScenery } from "./visuals/WorldScenery";

const config = loadGameConfig();
const STORAGE_KEY = "bastardoids-highscore";
const THRUSTER_NAMES: ThrusterName[] = ["forward", "reverse", "left", "right"];
const HEAT_SOFT_CAP = 100;
const HEAT_MAX = 150;
const OVERHEATED_VENT_MULTIPLIER = 0.65;
const SMALL_ASTEROID_COLLISION_DAMAGE = 20;
const LARGE_ASTEROID_COLLISION_DAMAGE = 30;
const PLAYER_THRUSTER_LOOP_ID = "player-thrusters";
const PLAYER_AFTERBURNER_LOOP_ID = "player-afterburner";
const ENEMY_THRUSTER_LOOP_ID_PREFIX = "enemy-thrusters-";
const ENEMY_THRUSTER_AUDIO_RANGE_X = 250;
const ENEMY_THRUSTER_AUDIO_RANGE_Z = 150;
const PLAYER_THRUSTER_AUDIO_VOLUME = 0.85;
const PLAYER_AFTERBURNER_AUDIO_VOLUME = 0.8;
const ENEMY_THRUSTER_AUDIO_VOLUME = 0.55;
const ENEMY_THRUSTER_AUDIO_PITCH = 1.35;

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
  audioSystem = new AudioSystem();
  keys = new Set<string>();
  primaryMouseDown = false;
  asteroids = new Map<number, AsteroidEntity>();
  enemies = new Map<number, EnemyShipEntity>();
  projectiles = new Map<number, ProjectileEntity>();
  referenceGrid = new ReferenceGrid(config.world);
  backgroundStars = new BackgroundStars(config.world);
  worldScenery = new WorldScenery();
  explosionSystem = new ExplosionSystem();
  viewport = new THREE.Vector2();
  world = config.world;
  debugMode = config.debugMode;
  performanceMonitor = new PerformanceMonitor();
  playerConfig = config.player;
  playerWeaponConfig = getWeaponDefinition(this.playerConfig.primaryWeapon);
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
    this.ui.setGameplayCursorHidden(false);
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
    this.scene.add(this.explosionSystem.root);

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
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("blur", this.onWindowBlur);
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
    this.audioSystem.unlock();
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

  onMouseDown = (event: MouseEvent): void => {
    this.audioSystem.unlock();
    if (event.button !== 0) {
      return;
    }

    this.primaryMouseDown = true;
    if (this.running) {
      this.tryFirePrimaryWeapon();
    }
  };

  onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.primaryMouseDown = false;
    }
  };

  onWindowBlur = (): void => {
    this.primaryMouseDown = false;
    this.stopLoopedMovementAudio();
  };

  startGame(): void {
    this.audioSystem.unlock();
    this.running = true;
    this.score = 0;
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
    this.createHunter();
    this.updateHud();
    this.ui.hideMenu();
    this.ui.setGameplayCursorHidden(true);
    this.clock.start();
  }

  quitToMenu(): void {
    this.running = false;
    this.stopLoopedMovementAudio();
    this.clearEntities();
    this.ui.setGameplayCursorHidden(false);
    this.updateMenu("Start");
  }

  gameOver(): void {
    this.running = false;
    this.stopLoopedMovementAudio();
    this.ui.setGameplayCursorHidden(false);
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

  createHunter(): void {
    const definition = getEnemyShipDefinition("hunter");
    const createdEnemy = createEnemyShip(
      definition,
      this.nextId++,
      new THREE.Vector3(200, 0, 0),
    );
    this.enemies.set(createdEnemy.enemy.id, createdEnemy.enemy);
    this.scene.add(createdEnemy.enemy.mesh);
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
      maxHull: asteroidCfg.maxHull,
      hull: asteroidCfg.maxHull,
      maxShield: 0,
      shield: 0,
      shieldRegen: 0,
      shieldRegenDelaySeconds: 0,
      shieldRegenCooldownUntil: 0,
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

  createProjectile(
    ownerId: number,
    faction: "player" | "enemy",
    weaponName: ProjectileEntity["weapon"],
    position: THREE.Vector3,
    velocity: THREE.Vector3,
  ): ProjectileEntity {
    const weaponDefinition = getWeaponDefinition(weaponName);
    const mesh = createWeaponProjectileMesh(weaponDefinition);
    mesh.position.copy(position);
    mesh.rotation.y = Math.atan2(velocity.x, velocity.z);

    const projectile: ProjectileEntity = {
      id: this.nextId++,
      type: "projectile",
      ownerId,
      weapon: weaponDefinition.name,
      faction,
      mass: weaponDefinition.mass,
      damage: weaponDefinition.damage,
      radius: weaponDefinition.radius,
      mesh,
      position: position.clone(),
      velocity: velocity.clone(),
      expiresAt: this.elapsed + weaponDefinition.lifetimeSeconds,
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

    const minDelay = 1 / this.playerWeaponConfig.shotsPerSecond;
    if (this.elapsed - this.lastShotAt < minDelay) {
      return;
    }

    if (this.fireShipPrimaryWeapon(this.player, this.playerConfig)) {
      this.lastShotAt = this.elapsed;
    }
  }

  fireShipPrimaryWeapon(
    ship: PlayerState | EnemyShipEntity,
    shipConfig: {
      primaryWeapon: ProjectileEntity["weapon"];
      muzzleOffsetForward: number;
      muzzleOffsetSide: number;
    },
  ): boolean {
    const weaponDefinition = getWeaponDefinition(shipConfig.primaryWeapon);
    if (!this.canShipFireWeapon(ship, weaponDefinition)) {
      return false;
    }

    ship.heat = Math.min(HEAT_MAX, ship.heat + weaponDefinition.heat);
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
    );
    this.createProjectile(
      ship.id,
      ship.faction,
      weaponDefinition.name,
      ship.position.clone().add(muzzleForward).sub(sideOffset),
      baseVelocity.clone(),
    );
    return true;
  }

  animate = (): void => {
    requestAnimationFrame(this.animate);
    this.performanceMonitor.beginFrame();
    const delta = Math.min(this.clock.getDelta() || 0.016, 0.033);
    if (this.running) {
      this.elapsed += delta;
      this.step(delta);
    }
    this.explosionSystem.update(delta);

    this.renderer.render(this.scene, this.camera);
    this.performanceMonitor.endFrame();
  };

  step(delta: number): void {
    this.handleInput(delta);
    this.updateEnemyShips(delta);
    this.updateShipHeat(delta);
    this.updateShieldRegeneration(delta);
    this.updateAfterburner(delta);
    this.spawnCooldown -= delta;
    if (this.spawnCooldown <= 0) {
      this.spawnAsteroid();
      this.spawnCooldown = this.getNextSpawnDelay();
    }

    this.integratePlayer(delta);
    this.integrateEnemyShips(delta);
    this.updateThrusterParticles(delta);
    this.integrateAsteroids(delta);
    this.integrateProjectiles(delta);
    this.handleProjectileHits();
    this.handleObjectCollisions();
    this.cleanupFarObjects();
    this.updateCamera(delta, false);
    this.updateHud();
    this.updateLoopedMovementAudio();

    if (this.playerLines && this.player) {
      this.playerLines.material.color.setHex(0xffffff);
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

    this.thrusterInputState.forward = thrustingForward;
    this.thrusterInputState.reverse = thrustingReverse;
    this.thrusterInputState.left = strafingLeft;
    this.thrusterInputState.right = strafingRight;
    this.afterburnerShiftHeld = shiftHeld;
    this.afterburnerActive = afterburnerEngaged;

    this.updatePointerWorld();
    const toPointer = this.pointerWorld.clone().sub(this.player.position);
    const targetYaw = toPointer.lengthSq() > 0.001 ? Math.atan2(toPointer.x, toPointer.z) : null;
    const playerIntent: ShipControlIntent = {
      targetYaw,
      forwardThrottle: thrustingForward ? 1 : 0,
      reverseThrottle: thrustingReverse ? 1 : 0,
      strafe: strafingLeft ? 1 : strafingRight ? -1 : 0,
      useAfterburner: afterburnerEngaged,
      firePrimary: false,
    };

    applyShipControl(this.player, this.playerConfig, playerIntent, delta, {
      maxSpeedOverride: activeSpeedCap,
      forwardThrustMultiplier: afterburnerEngaged ? this.afterburnerConfig.thrustMultiplier : 1,
    });

    if (this.primaryMouseDown) {
      this.tryFirePrimaryWeapon();
    }
  }

  integratePlayer(delta: number): void {
    if (!this.player) {
      return;
    }

    this.player.position.addScaledVector(this.player.velocity, delta);
    this.player.mesh.position.copy(this.player.position);
  }

  updateEnemyShips(delta: number): void {
    if (!this.player) {
      return;
    }

    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      const intent = updateEnemyAi(enemy, {
        player: this.player,
        asteroids: this.asteroids.values(),
        projectiles: this.projectiles.values(),
        enemies: this.enemies.values(),
        elapsed: this.elapsed,
        delta,
      });
      this.syncEnemyThrusterState(enemy, intent);
      applyShipControl(enemy, enemy.definition, intent, delta, {
        preserveOverspeed: true,
      });

      if (intent.firePrimary) {
        const fired = this.fireShipPrimaryWeapon(enemy, enemy.definition);
        if (fired) {
          const weaponDefinition = getWeaponDefinition(enemy.definition.primaryWeapon);
          enemy.blackboard.nextFireAt = this.elapsed + 1 / weaponDefinition.shotsPerSecond;
        }
      }
    }
  }

  integrateEnemyShips(delta: number): void {
    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      enemy.position.addScaledVector(enemy.velocity, delta);
      enemy.mesh.position.copy(enemy.position);
    }
  }

  updateThrusterParticles(delta: number): void {
    this.updatePlayerThrusterHoldState(delta);
    this.updateEnemyThrusterHoldState(delta);

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
      this.emitPlayerThrusterParticles("forward", delta);
      this.emitPlayerThrusterParticles("reverse", delta);
      this.emitPlayerThrusterParticles("left", delta);
      this.emitPlayerThrusterParticles("right", delta);
    }

    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      this.emitEnemyThrusterParticles(enemy, "forward", delta);
      this.emitEnemyThrusterParticles(enemy, "reverse", delta);
      this.emitEnemyThrusterParticles(enemy, "left", delta);
      this.emitEnemyThrusterParticles(enemy, "right", delta);
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
      if (!projectile.alive) {
        continue;
      }

      const target = this.findProjectileHitTarget(projectile);
      if (!target) {
        continue;
      }

      this.playProjectileHitSfx(projectile, target);
      this.applyProjectileImpact(projectile, target);
      this.destroyProjectile(projectile);
      this.applyDamageToEntity(target, projectile.damage);
    }
  }

  playProjectileHitSfx(
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

  findProjectileHitTarget(
    projectile: ProjectileEntity,
  ): AsteroidEntity | EnemyShipEntity | PlayerState | null {
    const candidates: Array<AsteroidEntity | EnemyShipEntity | PlayerState> = [
      ...this.asteroids.values(),
      ...this.enemies.values(),
    ];

    if (this.player) {
      candidates.push(this.player);
    }

    let bestTarget: AsteroidEntity | EnemyShipEntity | PlayerState | null = null;
    let bestDistanceSq = Infinity;

    for (const candidate of candidates) {
      if (!candidate.alive) {
        continue;
      }

      if (candidate.type !== "asteroid" && candidate.faction === projectile.faction) {
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

  applyProjectileImpact(
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

  applyAsteroidCollisionDamage(first: CollisionBody, second: CollisionBody): void {
    if (first.type === "asteroid" && second.type !== "asteroid") {
      this.applyShipCollisionDamageFromAsteroid(second, first);
      return;
    }

    if (second.type === "asteroid" && first.type !== "asteroid") {
      this.applyShipCollisionDamageFromAsteroid(first, second);
    }
  }

  applyShipCollisionDamageFromAsteroid(
    ship: CollisionBody,
    asteroid: AsteroidEntity,
  ): void {
    if (ship.type !== "player" && ship.type !== "enemyShip") {
      return;
    }

    const damage =
      asteroid.size === "small"
        ? SMALL_ASTEROID_COLLISION_DAMAGE
        : LARGE_ASTEROID_COLLISION_DAMAGE;
    this.applyDamageToEntity(ship, damage);
  }

  applyDamageToEntity(entity: DamageableEntity, damage: number): void {
    if (!entity.alive || damage <= 0) {
      return;
    }

    entity.shieldRegenCooldownUntil = this.elapsed + entity.shieldRegenDelaySeconds;

    let remainingDamage = damage;
    if (entity.shield > 0) {
      const absorbed = Math.min(entity.shield, remainingDamage);
      entity.shield -= absorbed;
      remainingDamage -= absorbed;
    }

    if (remainingDamage > 0) {
      entity.hull -= remainingDamage;
    }

    if (entity.hull > 0) {
      return;
    }

    if (entity.type === "asteroid") {
      if (entity.size === "small") {
        this.destroyAsteroid(entity);
        this.score += 1;
      } else {
        this.splitLargeAsteroid(entity);
      }
      return;
    }

    if (entity.type === "enemyShip") {
      this.destroyEnemy(entity);
      this.score += entity.definition.scoreValue;
      return;
    }

    this.destroyPlayer();
    this.gameOver();
  }

  handleObjectCollisions(): void {
    const dynamicObjects: CollisionBody[] = [
      ...this.asteroids.values(),
      ...this.enemies.values(),
      ...(this.player ? [this.player] : []),
    ];
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
        const impactCollision = separatingSpeed < 0;

        if (impactCollision) {
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

        if (!impactCollision) {
          continue;
        }

        this.applyAsteroidCollisionDamage(first, second);
      }
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

    const asteroidBounds = this.getPlayerBounds(this.world.asteroidDespawnDistanceScreens);
    for (const asteroid of [...this.asteroids.values()]) {
      if (this.isOutsidePlayerBounds(asteroid.position, asteroidBounds)) {
        this.wrapAsteroid(asteroid);
      }
    }

    const projectileBounds = this.getPlayerBounds(this.world.asteroidDistanceScreens);
    for (const projectile of [...this.projectiles.values()]) {
      if (this.isOutsidePlayerBounds(projectile.position, projectileBounds)) {
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
      running: this.running,
      highScore: this.highScore,
      velocityX: this.player ? this.player.velocity.x : 0,
      velocityZ: this.player ? this.player.velocity.z : 0,
      performance: this.debugMode ? this.performanceMonitor.getSnapshot() : null,
    });
    this.ui.updateShipStatus({
      hull: this.player?.hull ?? 0,
      maxHull: this.player?.maxHull ?? this.playerConfig.hull,
      shield: this.player?.shield ?? 0,
      maxShield: this.player?.maxShield ?? this.playerConfig.shield,
    });
    this.ui.updateAfterburner({
      charge: this.afterburnerCharge,
      maxCharge: this.afterburnerConfig.maxDurationSeconds,
      active: this.afterburnerActive,
      cooling: !this.afterburnerActive && !this.afterburnerShiftHeld,
    });
    this.ui.updateHeat({
      current: this.player?.heat ?? 0,
      max: HEAT_MAX,
    });
  }

  updateLoopedMovementAudio(): void {
    const playerUsingThrusters = THRUSTER_NAMES.some((name) => this.thrusterInputState[name]);
    if (this.running && this.player && playerUsingThrusters) {
      this.audioSystem.playLoop(PLAYER_THRUSTER_LOOP_ID, "thrustersLongLoop", {
        volume: PLAYER_THRUSTER_AUDIO_VOLUME,
      });
    } else {
      this.audioSystem.stopLoop(PLAYER_THRUSTER_LOOP_ID);
    }

    if (this.running && this.player && this.afterburnerActive) {
      this.audioSystem.playLoop(PLAYER_AFTERBURNER_LOOP_ID, "afterburnerLoop", {
        volume: PLAYER_AFTERBURNER_AUDIO_VOLUME,
      });
    } else {
      this.audioSystem.stopLoop(PLAYER_AFTERBURNER_LOOP_ID);
    }

    if (!this.running || !this.player) {
      this.stopEnemyThrusterLoops();
      return;
    }

    for (const enemy of this.enemies.values()) {
      const loopId = this.getEnemyThrusterLoopId(enemy.id);
      const enemyUsingThrusters = THRUSTER_NAMES.some((name) => enemy.thrusterState.inputState[name]);
      const deltaX = Math.abs(enemy.position.x - this.player.position.x);
      const deltaZ = Math.abs(enemy.position.z - this.player.position.z);
      const inRange =
        deltaX <= ENEMY_THRUSTER_AUDIO_RANGE_X && deltaZ <= ENEMY_THRUSTER_AUDIO_RANGE_Z;

      if (enemy.alive && enemyUsingThrusters && inRange) {
        this.audioSystem.playLoop(loopId, "thrustersLongLoop", {
          volume: ENEMY_THRUSTER_AUDIO_VOLUME,
          playbackRate: ENEMY_THRUSTER_AUDIO_PITCH,
        });
      } else {
        this.audioSystem.stopLoop(loopId);
      }
    }
  }

  stopLoopedMovementAudio(): void {
    this.audioSystem.stopLoop(PLAYER_THRUSTER_LOOP_ID);
    this.audioSystem.stopLoop(PLAYER_AFTERBURNER_LOOP_ID);
    this.stopEnemyThrusterLoops();
  }

  stopEnemyThrusterLoops(): void {
    for (const enemyId of this.enemies.keys()) {
      this.audioSystem.stopLoop(this.getEnemyThrusterLoopId(enemyId));
    }
  }

  getEnemyThrusterLoopId(enemyId: number): string {
    return `${ENEMY_THRUSTER_LOOP_ID_PREFIX}${enemyId}`;
  }

  getCameraPlanarAxes(): { forward: THREE.Vector3; right: THREE.Vector3 } {
    const forward = new THREE.Vector3()
      .subVectors(this.camera.position, this.cameraFocus)
      .setY(0)
      .normalize();
    return {
      forward,
      right: new THREE.Vector3(forward.z, 0, -forward.x),
    };
  }

  canShipFireWeapon(
    ship: ShipEntity,
    weaponDefinition: ReturnType<typeof getWeaponDefinition>,
  ): boolean {
    return ship.heat + weaponDefinition.heat <= HEAT_MAX;
  }

  updateShipHeat(delta: number): void {
    if (this.player) {
      this.ventShipHeat(this.player, delta);
    }

    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      this.ventShipHeat(enemy, delta);
    }
  }

  updateShieldRegeneration(delta: number): void {
    if (this.player) {
      this.regenerateShield(this.player, delta);
    }

    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      this.regenerateShield(enemy, delta);
    }
  }

  ventShipHeat(ship: ShipEntity, delta: number): void {
    const ventMultiplier = ship.heat > HEAT_SOFT_CAP ? OVERHEATED_VENT_MULTIPLIER : 1;
    ship.heat = Math.max(0, ship.heat - ship.vent * ventMultiplier * delta);
  }

  regenerateShield(entity: DamageableEntity, delta: number): void {
    if (
      entity.maxShield <= 0 ||
      entity.shieldRegen <= 0 ||
      entity.shield >= entity.maxShield ||
      this.elapsed < entity.shieldRegenCooldownUntil
    ) {
      return;
    }

    const shieldPerSecond = entity.maxShield * (entity.shieldRegen / 100);
    entity.shield = Math.min(entity.maxShield, entity.shield + shieldPerSecond * delta);
  }

  wrapAsteroid(asteroid: AsteroidEntity): void {
    if (!this.player) {
      return;
    }

    const spawnBounds = this.getPlayerBounds(this.world.asteroidDistanceScreens);
    const despawnBounds = this.getPlayerBounds(this.world.asteroidDespawnDistanceScreens);
    const { forward, right } = this.getCameraPlanarAxes();
    const relative = asteroid.position.clone().sub(this.player.position).setY(0);
    const localForward = relative.dot(forward);
    const localRight = relative.dot(right);
    const overflowRight = Math.abs(localRight) / Math.max(despawnBounds.halfWidth, 0.001);
    const overflowForward = Math.abs(localForward) / Math.max(despawnBounds.halfDepth, 0.001);
    const jitterFraction = THREE.MathUtils.clamp(
      this.world.asteroidWrapPositionJitterFraction,
      0,
      0.25,
    );

    let wrappedRight = localRight;
    let wrappedForward = localForward;

    if (overflowRight >= overflowForward) {
      wrappedRight = localRight > 0 ? -spawnBounds.halfWidth : spawnBounds.halfWidth;
      const orthogonalJitter = spawnBounds.halfDepth * jitterFraction;
      wrappedForward = THREE.MathUtils.clamp(
        localForward + (Math.random() * 2 - 1) * orthogonalJitter,
        -spawnBounds.halfDepth,
        spawnBounds.halfDepth,
      );
    } else {
      wrappedForward = localForward > 0 ? -spawnBounds.halfDepth : spawnBounds.halfDepth;
      const orthogonalJitter = spawnBounds.halfWidth * jitterFraction;
      wrappedRight = THREE.MathUtils.clamp(
        localRight + (Math.random() * 2 - 1) * orthogonalJitter,
        -spawnBounds.halfWidth,
        spawnBounds.halfWidth,
      );
    }

    asteroid.position
      .copy(this.player.position)
      .addScaledVector(forward, wrappedForward)
      .addScaledVector(right, wrappedRight);
    asteroid.mesh.position.copy(asteroid.position);

    const speed = asteroid.velocity.length();
    if (speed > 0.001) {
      const jitterRadians = THREE.MathUtils.degToRad(this.world.asteroidWrapHeadingJitterDegrees);
      const headingJitter = (Math.random() * 2 - 1) * jitterRadians;
      asteroid.velocity
        .setY(0)
        .normalize()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), headingJitter)
        .multiplyScalar(speed);
    }
  }

  destroyAsteroid(asteroid: AsteroidEntity, emitExplosion = true): void {
    asteroid.alive = false;
    this.asteroids.delete(asteroid.id);
    if (emitExplosion) {
      this.playExplosionSfx();
      this.spawnExplosion(
        asteroid.position,
        asteroid.radius,
        asteroid.mesh.material.color.getHex(),
        asteroid.velocity,
      );
    }
    this.scene.remove(asteroid.mesh);
  }

  destroyEnemy(enemy: EnemyShipEntity, emitExplosion = true): void {
    enemy.alive = false;
    this.enemies.delete(enemy.id);
    this.audioSystem.stopLoop(this.getEnemyThrusterLoopId(enemy.id));
    if (emitExplosion) {
      this.playExplosionSfx();
      this.spawnExplosion(enemy.position, enemy.radius, enemy.definition.lineColor, enemy.velocity);
    }
    this.scene.remove(enemy.mesh);
  }

  destroyProjectile(projectile: ProjectileEntity): void {
    projectile.alive = false;
    this.projectiles.delete(projectile.id);
    this.scene.remove(projectile.mesh);
  }

  clearEntities(): void {
    this.stopLoopedMovementAudio();
    for (const asteroid of this.asteroids.values()) {
      this.scene.remove(asteroid.mesh);
    }
    for (const enemy of this.enemies.values()) {
      this.scene.remove(enemy.mesh);
    }
    for (const projectile of this.projectiles.values()) {
      this.scene.remove(projectile.mesh);
    }
    this.asteroids.clear();
    this.enemies.clear();
    this.projectiles.clear();

    if (this.player) {
      this.scene.remove(this.player.mesh);
    }
    this.player = null;
    this.playerLines = null;
    this.playerShield = null;
    this.primaryMouseDown = false;
    this.resetThrusterParticles();
    this.explosionSystem.clear();
  }

  destroyPlayer(): void {
    if (!this.player) {
      return;
    }

    const player = this.player;
    player.alive = false;
    this.stopLoopedMovementAudio();
    this.playExplosionSfx();
    this.spawnExplosion(
      player.position,
      player.radius,
      this.playerLines?.material.color.getHex() ?? 0xffffff,
      player.velocity,
    );
    this.scene.remove(player.mesh);
    this.player = null;
    this.playerLines = null;
    this.playerShield = null;
  }

  spawnExplosion(
    position: THREE.Vector3,
    radius: number,
    color: THREE.ColorRepresentation,
    velocity?: THREE.Vector3,
  ): void {
    this.explosionSystem.spawn({
      position: position.clone(),
      radius,
      color,
      velocity: velocity?.clone(),
    });
  }

  playExplosionSfx(): void {
    this.audioSystem.playSfx("explosion1", {
      offsetSeconds: 0.05,
      playbackRateMin: 0.75,
      playbackRateMax: 1.25,
    });
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

    if (this.player.maxShield <= 0 || this.player.shield <= 0) {
      this.playerShield.visible = false;
      return;
    }

    const shieldMaterial = this.playerShield.material;
    const shieldRatio = this.player.shield / Math.max(this.player.maxShield, 1);
    const recentlyHit = this.player.shieldRegenCooldownUntil > this.elapsed;
    const pulse = Math.sin(this.elapsed * (recentlyHit ? 12 : 6)) * 0.5 + 0.5;
    const opacityStepMultiplier = Math.ceil(shieldRatio * 5) / 5;
    const fullShieldOpacity = 0.16;
    const hitBoost = recentlyHit ? pulse * 0.08 : 0;
    let baseColor = 0x69d8ff;
    let hitColor = 0x8fffb5;
    if (shieldRatio < 0.3) {
      baseColor = 0xff7448;
      hitColor = 0xffa06f;
    } else if (shieldRatio < 0.6) {
      baseColor = 0xffdf72;
      hitColor = 0xfff0a0;
    } else if (shieldRatio < 0.8) {
      baseColor = 0x8fffb5;
      hitColor = 0xc5ffd9;
    }

    this.playerShield.visible = true;
    this.playerShield.scale.setScalar(1 + pulse * 0.04);
    shieldMaterial.opacity = (fullShieldOpacity + hitBoost) * opacityStepMultiplier;
    shieldMaterial.color.setHex(recentlyHit ? hitColor : baseColor);
  }

  updatePlayerThrusterHoldState(delta: number): void {
    const buildup = this.thrusterConfig.buildupSeconds;
    for (const key of THRUSTER_NAMES) {
      this.thrusterHoldTime[key] = this.thrusterInputState[key]
        ? Math.min(this.thrusterHoldTime[key] + delta, buildup)
        : 0;
    }
  }

  updateEnemyThrusterHoldState(delta: number): void {
    const buildup = this.thrusterConfig.buildupSeconds;
    for (const enemy of this.enemies.values()) {
      for (const key of THRUSTER_NAMES) {
        enemy.thrusterState.holdTime[key] = enemy.thrusterState.inputState[key]
          ? Math.min(enemy.thrusterState.holdTime[key] + delta, buildup)
          : 0;
      }
    }
  }

  emitPlayerThrusterParticles(name: ThrusterName, delta: number): void {
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

    const emitter = this.getThrusterEmitter(this.player, name);
    for (let count = 0; count < emissionCount; count += 1) {
      this.spawnThrusterParticle(
        this.player,
        emitter,
        intensity,
        this.getThrusterLengthMultiplier(name),
      );
    }
  }

  emitEnemyThrusterParticles(
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
      this.spawnThrusterParticle(enemy, emitter, intensity, 1);
    }
  }

  getThrusterIntensity(name: ThrusterName): number {
    return THREE.MathUtils.clamp(
      this.thrusterHoldTime[name] / this.thrusterConfig.buildupSeconds,
      0,
      1,
    );
  }

  getEnemyThrusterIntensity(enemy: EnemyShipEntity, name: ThrusterName): number {
    return THREE.MathUtils.clamp(
      enemy.thrusterState.holdTime[name] / this.thrusterConfig.buildupSeconds,
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

  getThrusterEmitter(ship: ShipEntity, name: ThrusterName): ThrusterEmitter {
    const forward = new THREE.Vector3(Math.sin(ship.yaw), 0, Math.cos(ship.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const up = new THREE.Vector3(0, 1, 0);
    const visualScale = ship.type === "player" ? this.playerConfig.visualScale : ship.definition.visualScale;
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

  spawnThrusterParticle(
    ship: ShipEntity,
    emitter: ThrusterEmitter,
    intensity: number,
    lengthMultiplier: number,
  ): void {
    const particle = this.thrusterParticlePool.find((candidate) => !candidate.active);
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

    particle.active = true;
    particle.age = 0;
    particle.lifetime = lifetime * (0.85 + Math.random() * 0.3);
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

  syncEnemyThrusterState(enemy: EnemyShipEntity, intent: ShipControlIntent): void {
    enemy.thrusterState.inputState.forward = intent.forwardThrottle > 0.1;
    enemy.thrusterState.inputState.reverse = intent.reverseThrottle > 0.1;
    enemy.thrusterState.inputState.left = intent.strafe > 0.1;
    enemy.thrusterState.inputState.right = intent.strafe < -0.1;
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
}

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("App root not found.");
}

new BastardoidsApp(app);
