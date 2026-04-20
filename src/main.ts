import * as THREE from "three";
import type {
  AsteroidEntity,
  AsteroidSize,
  BackgroundStarTile,
  CollisionBody,
  LaserEntity,
  PlayerLines,
  PlayerShield,
  PlayerState,
  ReferenceGridBounds,
  ReferenceGridTile,
  ThrusterEmitter,
  ThrusterName,
  ThrusterParticle,
  ThrusterStateMap,
} from "./types";
import { loadGameConfig } from "./config";
import { requireElement } from "./utils";

const config = await loadGameConfig();
const STORAGE_KEY = "bastardoids-highscore";
const THRUSTER_NAMES: ThrusterName[] = ["forward", "reverse", "left", "right"];

class BastardoidsApp {
  scene = new THREE.Scene();
  renderer: THREE.WebGLRenderer;
  camera = new THREE.PerspectiveCamera(config.world.cameraFovDegrees ?? 58, 1, 0.1, 500);
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  pointerNdc = new THREE.Vector2(0, 0);
  cameraFocus = new THREE.Vector3();
  cameraTarget = new THREE.Vector3();
  cameraVelocity = new THREE.Vector3();
  pointerWorld = new THREE.Vector3();
  keys = new Set<string>();
  asteroids = new Map<number, AsteroidEntity>();
  lasers = new Map<number, LaserEntity>();
  gridRoot = new THREE.Group();
  gridTiles: ReferenceGridTile[] = [];
  gridCenter = new THREE.Vector3();
  starsRoot = new THREE.Group();
  starTiles: BackgroundStarTile[] = [];
  starsCenter = new THREE.Vector3();
  viewport = new THREE.Vector2();
  world = config.world;
  playerConfig = config.player;
  laserConfig = config.laser;
  spawnConfig = config.spawning;
  physicsConfig = config.physics;
  thrusterConfig = config.thrusters;
  afterburnerConfig = config.afterburner;
  gridTileWidth = 0;
  gridTileDepth = 0;
  starTileWidth = 0;
  starTileDepth = 0;
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
  afterburnerGauge: HTMLDivElement;
  afterburnerFill: HTMLDivElement;
  afterburnerLabel: HTMLSpanElement;
  root: HTMLDivElement;
  hud: HTMLDivElement;
  crosshair: HTMLDivElement;
  menu: HTMLDivElement;
  menuTitle: HTMLHeadingElement;
  menuCopy: HTMLParagraphElement;
  startButton: HTMLButtonElement;
  quitButton: HTMLButtonElement;
  highScoreLine: HTMLDivElement;
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
    this.root = document.createElement("div");
    this.root.className = "hud-root";

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.domElement.className = "game-canvas";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.root.append(this.renderer.domElement);

    this.hud = document.createElement("div");
    this.hud.className = "hud-bar";
    this.root.append(this.hud);

    this.afterburnerGauge = document.createElement("div");
    this.afterburnerGauge.className = "afterburner-gauge";
    this.afterburnerGauge.innerHTML = `
      <div class="afterburner-label-row">
        <span class="afterburner-name">Afterburner</span>
        <span class="afterburner-value">100%</span>
      </div>
      <div class="afterburner-track">
        <div class="afterburner-fill"></div>
      </div>
    `;
    this.afterburnerFill = requireElement(
      this.afterburnerGauge.querySelector<HTMLDivElement>(".afterburner-fill"),
      "Afterburner fill element not found.",
    );
    this.afterburnerLabel = requireElement(
      this.afterburnerGauge.querySelector<HTMLSpanElement>(".afterburner-value"),
      "Afterburner value element not found.",
    );
    this.root.append(this.afterburnerGauge);

    this.crosshair = document.createElement("div");
    this.crosshair.className = "crosshair";
    this.root.append(this.crosshair);

    this.menu = document.createElement("div");
    this.menu.className = "menu";
    this.menu.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">Bastardoids</h1>
        <p class="menu-copy">Wireframe prototype with mouse steering, inertial thrust, elastic-ish collisions, and persistent high score.</p>
      </div>
    `;

    const panel = requireElement(this.menu.firstElementChild, "Menu panel not found.");
    this.highScoreLine = document.createElement("div");
    this.highScoreLine.className = "menu-copy";
    panel.append(this.highScoreLine);

    this.startButton = document.createElement("button");
    this.startButton.className = "menu-button";
    this.startButton.type = "button";
    this.startButton.textContent = "Start";
    panel.append(this.startButton);

    this.quitButton = document.createElement("button");
    this.quitButton.className = "menu-button secondary";
    this.quitButton.type = "button";
    this.quitButton.textContent = "Quit";
    panel.append(this.quitButton);

    this.root.append(this.menu);
    container.append(this.root);

    this.menuTitle = requireElement(
      panel.querySelector<HTMLHeadingElement>(".menu-title"),
      "Menu title element not found.",
    );
    this.menuCopy = requireElement(
      panel.querySelector<HTMLParagraphElement>(".menu-copy"),
      "Menu copy element not found.",
    );

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

    this.gridRoot.position.y = -0.2;
    this.scene.add(this.gridRoot);
    this.scene.add(this.starsRoot);

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
    this.startButton.addEventListener("click", () => this.startGame());
    this.quitButton.addEventListener("click", () => this.quitToMenu());
  }

  onResize = (): void => {
    this.viewport.set(window.innerWidth, window.innerHeight);
    this.camera.aspect = this.viewport.x / this.viewport.y;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.viewport.x, this.viewport.y);
    this.updateCrosshairPosition();

    if (this.player) {
      this.updateCamera(0, true);
    }
  };

  onKeyDown = (event: KeyboardEvent): void => {
    this.keys.add(event.key.toLowerCase());

    if (event.code === "Space") {
      event.preventDefault();
      this.tryFireLaser();
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
    this.crosshair.style.left = `${event.clientX}px`;
    this.crosshair.style.top = `${event.clientY}px`;
    this.updatePointerWorld();
  };

  onMouseDown = (): void => {
    if (this.running) {
      this.tryFireLaser();
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
    this.menu.hidden = true;
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
    this.menu.hidden = false;
    this.menuTitle.textContent = "Bastardoids";
    this.menuCopy.textContent =
      copy ??
      "Wireframe prototype with mouse steering, inertial thrust, elastic-ish collisions, and persistent high score.";
    this.startButton.textContent = buttonLabel;
    this.highScoreLine.textContent = `High score: ${this.highScore}`;
  }

  createPlayer(): void {
    const group = new THREE.Group();
    const shipModel = new THREE.Group();
    const shipPoints = [
      new THREE.Vector3(0, 0, 3.4),
      new THREE.Vector3(-1.9, 0, -2.3),
      new THREE.Vector3(1.9, 0, -2.3),
      new THREE.Vector3(0, 1.4, -0.7),
    ];
    const edges: Array<[number, number]> = [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
    ];

    const vertices: number[] = [];
    for (const [from, to] of edges) {
      vertices.push(...shipPoints[from].toArray(), ...shipPoints[to].toArray());
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const lines = new THREE.LineSegments(geometry, material);
    shipModel.scale.setScalar(this.playerConfig.visualScale ?? 1);
    shipModel.add(lines);
    group.add(shipModel);
    this.playerLines = lines;

    const shieldGeometry = new THREE.SphereGeometry(this.playerConfig.radius * 2.15, 14, 12);
    const shieldMaterial = new THREE.MeshBasicMaterial({
      color: 0x69d8ff,
      transparent: true,
      opacity: 0.18,
      wireframe: true,
      depthWrite: false,
    });
    const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
    shield.visible = false;
    group.add(shield);
    this.playerShield = shield;

    this.scene.add(group);
    this.player = {
      id: this.nextId++,
      type: "player",
      mass: this.playerConfig.mass,
      radius: this.playerConfig.radius,
      mesh: group,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      yaw: 0,
      yawVelocity: 0,
      invulnerableUntil: 0,
      alive: true,
    } satisfies PlayerState;

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
    const asteroidCfg = config.asteroids[size];
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

  createLaser(position: THREE.Vector3, velocity: THREE.Vector3): LaserEntity {
    const mesh = new THREE.Group();
    const geometry = new THREE.CylinderGeometry(
      this.laserConfig.visualWidth / 2,
      this.laserConfig.visualWidth / 2,
      this.laserConfig.visualLength,
      10,
    );
    const material = new THREE.MeshBasicMaterial({
      color: 0xff4343,
      transparent: true,
      opacity: 0.92,
    });
    const core = new THREE.Mesh(geometry, material);
    core.rotation.x = Math.PI / 2;
    mesh.add(core);
    mesh.position.copy(position);
    mesh.rotation.y = Math.atan2(velocity.x, velocity.z);

    const laser: LaserEntity = {
      id: this.nextId++,
      type: "laser",
      mass: 0.05,
      radius: this.laserConfig.radius,
      mesh,
      position: position.clone(),
      velocity: velocity.clone(),
      expiresAt: this.elapsed + this.laserConfig.lifetimeSeconds,
      alive: true,
    };

    this.lasers.set(laser.id, laser);
    this.scene.add(mesh);
    return laser;
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

  tryFireLaser(): void {
    if (!this.running || !this.player) {
      return;
    }

    const minDelay = 1 / this.laserConfig.shotsPerSecond;
    if (this.elapsed - this.lastShotAt < minDelay) {
      return;
    }

    this.lastShotAt = this.elapsed;

    const forward = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const baseVelocity = this.player.velocity
      .clone()
      .add(forward.clone().multiplyScalar(this.laserConfig.speed));
    const muzzleForward = forward.clone().multiplyScalar(this.playerConfig.muzzleOffsetForward);
    const sideOffset = right.clone().multiplyScalar(this.playerConfig.muzzleOffsetSide);

    this.createLaser(
      this.player.position.clone().add(muzzleForward).add(sideOffset),
      baseVelocity.clone(),
    );
    this.createLaser(
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
    this.integrateLasers(delta);
    this.handleLaserHits();
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

  integrateLasers(delta: number): void {
    for (const laser of [...this.lasers.values()]) {
      laser.position.addScaledVector(laser.velocity, delta);
      laser.mesh.position.copy(laser.position);
      laser.mesh.rotation.y = Math.atan2(laser.velocity.x, laser.velocity.z);

      if (this.elapsed >= laser.expiresAt) {
        this.destroyLaser(laser);
      }
    }
  }

  handleLaserHits(): void {
    for (const laser of [...this.lasers.values()]) {
      for (const asteroid of [...this.asteroids.values()]) {
        if (!laser.alive || !asteroid.alive) {
          continue;
        }

        const hitDistance = laser.radius + asteroid.radius;
        if (laser.position.distanceToSquared(asteroid.position) > hitDistance * hitDistance) {
          continue;
        }

        this.destroyLaser(laser);
        if (asteroid.size === "small") {
          this.destroyAsteroid(asteroid);
          this.score += 1;
        } else {
          this.splitLargeAsteroid(asteroid);
        }
        break;
      }
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
    const asteroidCfg = config.asteroids[size];
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

    for (const laser of [...this.lasers.values()]) {
      if (this.isOutsidePlayerBounds(laser.position, bounds)) {
        this.destroyLaser(laser);
      }
    }
  }

  updateCamera(delta: number, force: boolean): void {
    if (!this.player) {
      return;
    }

    const lookDirection = this.getCameraLookDirection();
    this.cameraTarget
      .copy(this.player.position)
      .addScaledVector(lookDirection, this.world.cameraLookAhead);
    this.cameraTarget.y = 0;

    if (force) {
      this.cameraFocus.copy(this.cameraTarget);
      this.cameraVelocity.set(0, 0, 0);
    } else {
      const springOffset = this.cameraTarget.clone().sub(this.cameraFocus);
      springOffset.y = 0;
      this.cameraVelocity.addScaledVector(springOffset, this.world.cameraTetherStrength * delta);
      this.cameraVelocity.multiplyScalar(Math.exp(-this.world.cameraTetherDamping * delta));

      const horizontalSpeed = Math.hypot(this.cameraVelocity.x, this.cameraVelocity.z);
      if (horizontalSpeed > this.world.cameraMaxSpeed) {
        const scale = this.world.cameraMaxSpeed / horizontalSpeed;
        this.cameraVelocity.x *= scale;
        this.cameraVelocity.z *= scale;
      }

      this.cameraFocus.addScaledVector(this.cameraVelocity, delta);
      this.cameraFocus.y = 0;
    }

    this.camera.position.set(
      this.cameraFocus.x,
      this.getCameraHeight(),
      this.cameraFocus.z + this.world.cameraDistance,
    );
    this.camera.lookAt(this.cameraFocus);
    this.refreshReferenceGrid(force);
    this.refreshBackgroundStars(force);
  }

  updatePointerWorld(): void {
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    this.raycaster.ray.intersectPlane(this.plane, this.pointerWorld);
  }

  updateCrosshairPosition(): void {
    this.crosshair.style.left = `${((this.pointerNdc.x + 1) * this.viewport.x) / 2}px`;
    this.crosshair.style.top = `${((1 - this.pointerNdc.y) * this.viewport.y) / 2}px`;
  }

  updateHud(): void {
    const invulnerable =
      this.player && this.player.invulnerableUntil > this.elapsed ? "Shielded" : "Live";
    const velocityX = this.player ? this.player.velocity.x.toFixed(1) : "0.0";
    const velocityZ = this.player ? this.player.velocity.z.toFixed(1) : "0.0";
    this.hud.innerHTML = `
      <span>Score ${this.score}</span>
      <span>Lives ${this.lives}</span>
      <span>State ${this.running ? invulnerable : "Menu"}</span>
      <span>High ${this.highScore}</span>
      <span>X vel ${velocityX}</span>
      <span>Z vel ${velocityZ}</span>
    `;

    const afterburnerPercent = Math.round(
      (this.afterburnerCharge / this.afterburnerConfig.maxDurationSeconds) * 100,
    );
    this.afterburnerFill.style.width = `${afterburnerPercent}%`;
    this.afterburnerLabel.textContent = `${afterburnerPercent}%`;
    this.afterburnerGauge.classList.toggle("active", this.afterburnerActive);
    this.afterburnerGauge.classList.toggle(
      "cooling",
      !this.afterburnerActive && !this.afterburnerShiftHeld,
    );
  }

  destroyAsteroid(asteroid: AsteroidEntity): void {
    asteroid.alive = false;
    this.asteroids.delete(asteroid.id);
    this.scene.remove(asteroid.mesh);
  }

  destroyLaser(laser: LaserEntity): void {
    laser.alive = false;
    this.lasers.delete(laser.id);
    this.scene.remove(laser.mesh);
  }

  clearEntities(): void {
    for (const asteroid of this.asteroids.values()) {
      this.scene.remove(asteroid.mesh);
    }
    for (const laser of this.lasers.values()) {
      this.scene.remove(laser.mesh);
    }
    this.asteroids.clear();
    this.lasers.clear();

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
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = Math.abs(this.camera.position.y);
    return 2 * Math.tan(vFov / 2) * distance;
  }

  getCameraHeight(): number {
    if (Number.isFinite(this.world.cameraPitchDegrees)) {
      const horizontalOffset = this.world.cameraDistance;
      const pitchRadians = THREE.MathUtils.degToRad(this.world.cameraPitchDegrees);
      const tangent = Math.tan(pitchRadians);
      if (Math.abs(tangent) > 0.001) {
        return horizontalOffset * tangent;
      }
    }

    return this.world.cameraHeight;
  }

  getCameraLookDirection(): THREE.Vector3 {
    if (!this.player) {
      return new THREE.Vector3(0, 0, -1);
    }

    const velocityDirection = this.player.velocity.clone().setY(0);
    if (velocityDirection.lengthSq() > 1) {
      return velocityDirection.normalize();
    }

    return new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
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

  refreshReferenceGrid(force: boolean): void {
    const cellSize = this.world.gridCellSize;
    const viewBounds = this.getReferenceGridBounds();
    const desiredWidth = Math.ceil(((viewBounds.halfWidth * 2) / cellSize)) * cellSize;
    const desiredDepth = Math.ceil(((viewBounds.halfDepth * 2) / cellSize)) * cellSize;
    const sizeChanged =
      Math.abs(desiredWidth - this.gridTileWidth) > 0.001 ||
      Math.abs(desiredDepth - this.gridTileDepth) > 0.001;

    if (force || sizeChanged || this.gridTiles.length === 0) {
      this.gridTileWidth = desiredWidth;
      this.gridTileDepth = desiredDepth;
      this.rebuildReferenceGrid();
    }

    this.positionReferenceGrid();
  }

  refreshBackgroundStars(force: boolean): void {
    const viewBounds = this.getReferenceGridBounds();
    const desiredWidth = Math.ceil(viewBounds.halfWidth * 2);
    const desiredDepth = Math.ceil(viewBounds.halfDepth * 2);
    const sizeChanged =
      Math.abs(desiredWidth - this.starTileWidth) > 0.001 ||
      Math.abs(desiredDepth - this.starTileDepth) > 0.001;

    if (force || sizeChanged || this.starTiles.length === 0) {
      this.starTileWidth = desiredWidth;
      this.starTileDepth = desiredDepth;
      this.rebuildBackgroundStars();
    }

    this.positionBackgroundStars();
  }

  getReferenceGridBounds(): ReferenceGridBounds {
    const viewHeight = this.getWorldViewHeight();
    const viewWidth = viewHeight * this.camera.aspect;
    return {
      halfWidth: viewWidth / 2,
      halfDepth: viewHeight / 2,
    };
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

  rebuildReferenceGrid(): void {
    for (const tile of this.gridTiles) {
      tile.traverse((child: THREE.Object3D) => {
        const disposableChild = child as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };

        if (disposableChild.geometry) {
          disposableChild.geometry.dispose();
        }
        if (Array.isArray(disposableChild.material)) {
          for (const material of disposableChild.material) {
            material.dispose();
          }
        } else {
          disposableChild.material?.dispose();
        }
      });
    }

    this.gridRoot.clear();
    this.gridTiles = [];

    for (let zIndex = -1; zIndex <= 1; zIndex += 1) {
      for (let xIndex = -1; xIndex <= 1; xIndex += 1) {
        const tile = this.buildGridTile();
        tile.userData.offsetX = xIndex;
        tile.userData.offsetZ = zIndex;
        this.gridTiles.push(tile);
        this.gridRoot.add(tile);
      }
    }
  }

  rebuildBackgroundStars(): void {
    for (const tile of this.starTiles) {
      tile.geometry.dispose();
      tile.material.dispose();
    }

    this.starsRoot.clear();
    this.starTiles = [];

    for (let zIndex = -1; zIndex <= 1; zIndex += 1) {
      for (let xIndex = -1; xIndex <= 1; xIndex += 1) {
        const tile = this.buildStarTile();
        tile.userData.offsetX = xIndex;
        tile.userData.offsetZ = zIndex;
        this.starTiles.push(tile);
        this.starsRoot.add(tile);
      }
    }
  }

  buildStarTile(): BackgroundStarTile {
    const starVertices: number[] = [];
    const halfWidth = this.starTileWidth / 2;
    const halfDepth = this.starTileDepth / 2;
    for (let index = 0; index < this.world.backgroundStarsPerTile; index += 1) {
      starVertices.push(
        (Math.random() * 2 - 1) * halfWidth,
        this.world.backgroundStarHeightMin +
          Math.random() *
            (this.world.backgroundStarHeightMax - this.world.backgroundStarHeightMin),
        (Math.random() * 2 - 1) * halfDepth,
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(starVertices, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xbad8ff,
        size: this.world.backgroundStarSize,
        sizeAttenuation: true,
      }),
    );
  }

  buildGridTile(): ReferenceGridTile {
    const group = new THREE.Group();
    const minorVertices: number[] = [];
    const majorVertices: number[] = [];
    const halfWidth = this.gridTileWidth / 2;
    const halfDepth = this.gridTileDepth / 2;
    const cellSize = this.world.gridCellSize;
    const majorEvery = this.world.gridMajorEvery;
    const epsilon = 0.0001;
    let columnIndex = 0;

    for (let x = -halfWidth; x <= halfWidth + epsilon; x += cellSize) {
      const target = columnIndex % majorEvery === 0 ? majorVertices : minorVertices;
      target.push(x, 0, -halfDepth, x, 0, halfDepth);
      columnIndex += 1;
    }

    let rowIndex = 0;
    for (let z = -halfDepth; z <= halfDepth + epsilon; z += cellSize) {
      const target = rowIndex % majorEvery === 0 ? majorVertices : minorVertices;
      target.push(-halfWidth, 0, z, halfWidth, 0, z);
      rowIndex += 1;
    }

    if (minorVertices.length > 0) {
      const minorGeometry = new THREE.BufferGeometry();
      minorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(minorVertices, 3));
      group.add(
        new THREE.LineSegments(
          minorGeometry,
          new THREE.LineBasicMaterial({
            color: 0x17304d,
            transparent: true,
            opacity: 0.55,
          }),
        ),
      );
    }

    if (majorVertices.length > 0) {
      const majorGeometry = new THREE.BufferGeometry();
      majorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(majorVertices, 3));
      group.add(
        new THREE.LineSegments(
          majorGeometry,
          new THREE.LineBasicMaterial({
            color: 0x3f6fa6,
            transparent: true,
            opacity: 0.95,
          }),
        ),
      );
    }

    return group;
  }

  positionReferenceGrid(): void {
    if (this.gridTileWidth <= 0 || this.gridTileDepth <= 0) {
      return;
    }

    this.gridCenter.set(
      Math.round(this.cameraFocus.x / this.gridTileWidth) * this.gridTileWidth,
      0,
      Math.round(this.cameraFocus.z / this.gridTileDepth) * this.gridTileDepth,
    );

    for (const tile of this.gridTiles) {
      tile.position.set(
        this.gridCenter.x + tile.userData.offsetX * this.gridTileWidth,
        0,
        this.gridCenter.z + tile.userData.offsetZ * this.gridTileDepth,
      );
    }
  }

  positionBackgroundStars(): void {
    if (this.starTileWidth <= 0 || this.starTileDepth <= 0) {
      return;
    }

    this.starsCenter.set(
      Math.round(this.cameraFocus.x / this.starTileWidth) * this.starTileWidth,
      0,
      Math.round(this.cameraFocus.z / this.starTileDepth) * this.starTileDepth,
    );

    for (const tile of this.starTiles) {
      tile.position.set(
        this.starsCenter.x + tile.userData.offsetX * this.starTileWidth,
        0,
        this.starsCenter.z + tile.userData.offsetZ * this.starTileDepth,
      );
    }
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
