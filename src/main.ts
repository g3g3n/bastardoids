import * as THREE from "three";
import type {
  AsteroidEntity,
  AsteroidSize,
  CollisionBody,
  DamageableEntity,
  EnemyShipName,
  EnemyShipEntity,
  PlayerLines,
  PlayerShield,
  PlayerState,
  PlayerVentEffect,
  ReferenceGridBounds,
  ShipControlIntent,
  ShipEntity,
  ThrusterName,
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
import { getPrimaryFireWeapon } from "./entities/ships/loadout";
import { applyShipControl } from "./entities/ships/shipController";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { createPlayer } from "./player/createPlayer";
import { getPlayerSkillDefinition } from "./player/progression/skills";
import {
  activateBoundActiveSkill,
  applyLevelUpOffer,
  createPlayerProgressionState,
  generateLevelUpOffers,
  getNextPendingLevel,
  hasPendingLevelUp,
  loadHighestXp,
  queueProgressionRewards,
  storeHighestXp,
  syncExpiredActiveSkills,
} from "./player/progression/progression";
import { resolvePlayerStats } from "./player/progression/resolvePlayerStats";
import { getLevelForXp, getXpProgressForLevel } from "./player/progression/xpTable";
import type {
  ActiveSkillKey,
  PlayerProgressionState,
  ResolvedPlayerStats,
} from "./player/progression/types";
import { CombatSystem } from "./systems/CombatSystem";
import { SpawnDirector } from "./systems/SpawnDirector";
import { GameUi } from "./ui/GameUi";
import { BackgroundStars } from "./visuals/BackgroundStars";
import {
  hideEmergencyVentEffect,
  updateEmergencyVentEffectVisual,
} from "./visuals/EmergencyVentEffect";
import { ExplosionSystem } from "./visuals/ExplosionSystem";
import { ReferenceGrid } from "./visuals/ReferenceGrid";
import { ThrusterParticleSystem } from "./visuals/ThrusterParticleSystem";
import { WorldScenery } from "./visuals/WorldScenery";

const config = loadGameConfig();
const THRUSTER_NAMES: ThrusterName[] = ["forward", "reverse", "left", "right"];
const OVERHEATED_VENT_MULTIPLIER = 0.65;
const SMALL_ASTEROID_COLLISION_DAMAGE = 20;
const MEDIUM_ASTEROID_COLLISION_DAMAGE = 30;
const PLAYER_THRUSTER_LOOP_ID = "player-thrusters";
const PLAYER_AFTERBURNER_LOOP_ID = "player-afterburner";
const ENEMY_THRUSTER_LOOP_ID_PREFIX = "enemy-thrusters-";
const ENEMY_THRUSTER_AUDIO_RANGE_X = 250;
const ENEMY_THRUSTER_AUDIO_RANGE_Z = 150;
const PLAYER_THRUSTER_AUDIO_VOLUME = 0.85;
const PLAYER_AFTERBURNER_AUDIO_VOLUME = 0.8;
const ENEMY_THRUSTER_AUDIO_VOLUME = 0.55;
const ENEMY_THRUSTER_AUDIO_PITCH = 1.35;
const ENEMY_TRACK_PERSIST_SECONDS = 30;
const ENEMY_TRACK_MAX_DISTANCE = 400;
const ENEMY_TRACK_AUTO_MARK_RADIUS = 190;
const ENEMY_TRACK_EDGE_NDC_X = 0.92;
const ENEMY_TRACK_EDGE_NDC_Y = 0.82;
const COLLISION_RING_COLOR = 0x3dff79;
const COLLISION_RING_Y_OFFSET = 0.12;
const ENEMY_TACTIC_LABEL_SCREEN_OFFSET_PX = 18;
const ENEMY_INTERCEPT_LINE_LENGTH = 150;
const ENEMY_INTERCEPT_LINE_COLOR = 0xff5b5b;
const ENEMY_INTERCEPT_LINE_FORWARD = new THREE.Vector3(0, 0, 1);
const ACTIVE_SKILL_KEYS = new Set<ActiveSkillKey>(["KeyQ", "KeyE", "KeyR", "KeyF", "KeyV"]);
const PLAYER_ENEMY_PROXIMITY_XP_RADIUS = 300;
const LEVEL_UP_PAUSE_DELAY_SECONDS = 1.2;

type GamePhase = "menu" | "playing" | "levelUp" | "gameOver";

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
  referenceGrid = new ReferenceGrid(config.world);
  backgroundStars = new BackgroundStars(config.world);
  worldScenery = new WorldScenery();
  explosionSystem = new ExplosionSystem();
  viewport = new THREE.Vector2();
  world = config.world;
  debugMode = config.debugMode;
  showCollisionRings = config.showCollisionRings;
  showEnemyTactic = config.showEnemyTactic;
  showEnemyIntercept = config.showEnemyIntercept;
  showEmergencyVentEffect = config.showEmergencyVentEffect;
  performanceMonitor = new PerformanceMonitor();
  playerConfig = config.player;
  spawnConfig = config.spawning;
  physicsConfig = config.physics;
  thrusterConfig = config.thrusters;
  afterburnerConfig = config.afterburner;
  combat!: CombatSystem;
  spawnDirector!: SpawnDirector;
  thrusterParticles!: ThrusterParticleSystem;
  thrusterInputState: ThrusterStateMap<boolean> = {
    forward: false,
    reverse: false,
    left: false,
    right: false,
  };
  player: PlayerState | null = null;
  playerLines: PlayerLines | null = null;
  playerShield: PlayerShield | null = null;
  playerVentEffect: PlayerVentEffect | null = null;
  enemyShields = new Map<number, PlayerShield>();
  collisionRingRoot = new THREE.Group();
  collisionRingGeometry = this.buildCollisionRingGeometry();
  collisionRingMaterial = new THREE.LineBasicMaterial({
    color: COLLISION_RING_COLOR,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: false,
  });
  collisionRings = new Map<number, THREE.LineLoop>();
  enemyInterceptRoot = new THREE.Group();
  enemyInterceptGeometry = this.buildEnemyInterceptGeometry();
  enemyInterceptMaterial = new THREE.LineBasicMaterial({
    color: ENEMY_INTERCEPT_LINE_COLOR,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    depthTest: false,
  });
  enemyInterceptLines = new Map<number, THREE.Line>();
  nextId = 1;
  phase: GamePhase = "menu";
  highestXp = loadHighestXp();
  progression: PlayerProgressionState = createPlayerProgressionState();
  resolvedPlayerStats: ResolvedPlayerStats = resolvePlayerStats(
    this.playerConfig,
    this.progression,
    0,
  );
  elapsed = 0;
  afterburnerCharge = this.afterburnerConfig.maxDurationSeconds;
  afterburnerActive = false;
  afterburnerShiftHeld = false;
  afterburnerEffectTime = 0;
  currentSpeedCap = this.playerConfig.maxSpeed;
  levelUpPauseAt: number | null = null;

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
    this.combat = new CombatSystem(this.audioSystem, {
      allocateId: () => this.nextId++,
      addObjectToScene: (object) => this.scene.add(object),
      removeObjectFromScene: (object) => this.scene.remove(object),
      attachCollisionRing: (entity) => this.attachCollisionRing(entity),
      removeCollisionRing: (entityId) => this.removeCollisionRing(entityId),
      grantPlayerRewards: (xpReward, scrapReward) => this.grantPlayerRewards(xpReward, scrapReward),
      splitLargeAsteroid: (asteroid) => this.splitLargeAsteroid(asteroid),
      destroyAsteroid: (asteroid, emitExplosion) => this.destroyAsteroid(asteroid, emitExplosion),
      destroyEnemy: (enemy, emitExplosion) => this.destroyEnemy(enemy, emitExplosion),
      destroyPlayerRun: () => {
        this.destroyPlayer();
        this.gameOver();
      },
      isEnemyWithinPlayerXpRewardRadius: (enemy) => this.isEnemyWithinPlayerXpRewardRadius(enemy),
    }, {
      smallAsteroidCollisionDamage: SMALL_ASTEROID_COLLISION_DAMAGE,
      mediumAsteroidCollisionDamage: MEDIUM_ASTEROID_COLLISION_DAMAGE,
    });
    this.spawnDirector = new SpawnDirector(this.world, this.spawnConfig);
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
    this.scene.add(this.collisionRingRoot);
    this.scene.add(this.enemyInterceptRoot);
    this.thrusterParticles = new ThrusterParticleSystem(
      this.scene,
      this.thrusterConfig,
      this.afterburnerConfig,
      this.playerConfig.visualScale,
    );
  }

  isPlaying(): boolean {
    return this.phase === "playing";
  }

  isGameplayVisible(): boolean {
    return this.phase === "playing" || this.phase === "levelUp";
  }

  buildCollisionRingGeometry(): THREE.BufferGeometry {
    const segments = 48;
    const points: THREE.Vector3[] = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));
    }

    return new THREE.BufferGeometry().setFromPoints(points);
  }

  buildEnemyInterceptGeometry(): THREE.BufferGeometry {
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
    ]);
  }

  attachCollisionRing(entity: {
    id: number;
    radius: number;
    position: THREE.Vector3;
  }): void {
    if (!this.showCollisionRings) {
      return;
    }

    const ring = new THREE.LineLoop(this.collisionRingGeometry, this.collisionRingMaterial);
    ring.scale.setScalar(entity.radius);
    ring.position.copy(entity.position);
    ring.position.y += COLLISION_RING_Y_OFFSET;
    ring.renderOrder = 30;
    this.collisionRings.set(entity.id, ring);
    this.collisionRingRoot.add(ring);
  }

  syncCollisionRing(entity: {
    id: number;
    position: THREE.Vector3;
  }): void {
    if (!this.showCollisionRings) {
      return;
    }

    const ring = this.collisionRings.get(entity.id);
    if (!ring) {
      return;
    }

    ring.position.copy(entity.position);
    ring.position.y += COLLISION_RING_Y_OFFSET;
  }

  removeCollisionRing(entityId: number): void {
    const ring = this.collisionRings.get(entityId);
    if (!ring) {
      return;
    }

    this.collisionRings.delete(entityId);
    this.collisionRingRoot.remove(ring);
  }

  syncEnemyInterceptDebug(): void {
    if (!this.showEnemyIntercept || !this.isGameplayVisible()) {
      this.clearEnemyInterceptLines();
      return;
    }

    const activeIds = new Set<number>();
    for (const enemy of this.enemies.values()) {
      if (!enemy.alive || !enemy.blackboard.debugHasInterceptPoint) {
        continue;
      }

      activeIds.add(enemy.id);
      let line = this.enemyInterceptLines.get(enemy.id);
      if (!line) {
        line = new THREE.Line(this.enemyInterceptGeometry, this.enemyInterceptMaterial);
        line.renderOrder = 31;
        this.enemyInterceptLines.set(enemy.id, line);
        this.enemyInterceptRoot.add(line);
      }

      line.position.copy(enemy.position);
      line.scale.set(1, 1, ENEMY_INTERCEPT_LINE_LENGTH);
      line.quaternion.setFromUnitVectors(
        ENEMY_INTERCEPT_LINE_FORWARD,
        enemy.blackboard.debugInterceptDirection,
      );
    }

    for (const enemyId of [...this.enemyInterceptLines.keys()]) {
      if (activeIds.has(enemyId)) {
        continue;
      }

      this.removeEnemyInterceptLine(enemyId);
    }
  }

  removeEnemyInterceptLine(enemyId: number): void {
    const line = this.enemyInterceptLines.get(enemyId);
    if (!line) {
      return;
    }

    this.enemyInterceptLines.delete(enemyId);
    this.enemyInterceptRoot.remove(line);
  }

  clearEnemyInterceptLines(): void {
    this.enemyInterceptLines.clear();
    this.enemyInterceptRoot.clear();
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
    this.ui.onLevelChoice((choiceIndex) => this.handleLevelUpChoice(choiceIndex));
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

    if (this.phase === "levelUp") {
      const choiceIndex = this.getLevelChoiceIndexFromKey(event.key);
      if (choiceIndex !== null) {
        event.preventDefault();
        this.handleLevelUpChoice(choiceIndex);
      }
      return;
    }

    if (ACTIVE_SKILL_KEYS.has(event.code as ActiveSkillKey) && this.isPlaying()) {
      event.preventDefault();
      this.tryActivateActiveSkill(event.code as ActiveSkillKey);
      return;
    }

    this.keys.add(event.key.toLowerCase());

    if (event.code === "Space" && this.isPlaying()) {
      event.preventDefault();
      this.combat.tryFirePlayerPrimaryWeapon(this.player, this.resolvedPlayerStats, this.elapsed);
    }

    if ((this.phase === "menu" || this.phase === "gameOver") && event.key === "Enter") {
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
    if (event.button !== 0 || !this.isPlaying()) {
      return;
    }

    this.primaryMouseDown = true;
    this.combat.tryFirePlayerPrimaryWeapon(this.player, this.resolvedPlayerStats, this.elapsed);
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
    this.phase = "playing";
    this.elapsed = 0;
    this.progression = createPlayerProgressionState();
    this.resolvedPlayerStats = resolvePlayerStats(this.playerConfig, this.progression, this.elapsed);
    this.combat.reset();
    this.spawnDirector.reset();
    this.afterburnerCharge = this.afterburnerConfig.maxDurationSeconds;
    this.afterburnerActive = false;
    this.afterburnerShiftHeld = false;
    this.afterburnerEffectTime = 0;
    this.currentSpeedCap = this.resolvedPlayerStats.config.maxSpeed;
    this.levelUpPauseAt = null;
    this.keys.clear();
    this.primaryMouseDown = false;
    this.clearEntities();
    this.createPlayer();
    this.spawnDirector.spawnInitialAsteroids(this.player, (size, position, velocity) =>
      this.createAsteroid(size, position, velocity),
    );
    this.updateHud();
    this.ui.hideMenu();
    this.ui.hideLevelUp();
    this.ui.setGameplayCursorHidden(true);
    this.clock.start();
  }

  quitToMenu(): void {
    this.phase = "menu";
    this.stopLoopedMovementAudio();
    this.clearEntities();
    this.levelUpPauseAt = null;
    this.keys.clear();
    this.ui.setGameplayCursorHidden(false);
    this.ui.hideLevelUp();
    this.updateMenu("Start");
  }

  gameOver(): void {
    this.phase = "gameOver";
    this.stopLoopedMovementAudio();
    this.keys.clear();
    this.primaryMouseDown = false;
    this.levelUpPauseAt = null;
    this.ui.setGameplayCursorHidden(false);
    this.clearEnemyInterceptLines();
    this.ui.updateEnemyTrackers([]);
    this.ui.updateEnemyTactics([]);
    if (this.progression.totalXp > this.highestXp) {
      this.highestXp = this.progression.totalXp;
      storeHighestXp(this.highestXp);
    }

    this.ui.hideLevelUp();
    this.updateMenu(
      "Restart",
      `Game over. Final XP: ${this.progression.totalXp}. Scrap: ${this.progression.scrap}.`,
    );
  }

  updateMenu(buttonLabel: string, copy?: string): void {
    this.ui.setMenuState(buttonLabel, this.highestXp, copy);
  }

  getStatusLabel(): string {
    if (this.phase === "playing") {
      return "Flight";
    }
    if (this.phase === "levelUp") {
      return "Level Up";
    }
    if (this.phase === "gameOver") {
      return "Game Over";
    }
    return "Menu";
  }

  getLevelChoiceIndexFromKey(key: string): number | null {
    const parsed = Number.parseInt(key, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed - 1;
  }

  refreshResolvedPlayerStats(): void {
    this.resolvedPlayerStats = resolvePlayerStats(this.playerConfig, this.progression, this.elapsed);
    if (!this.player) {
      return;
    }

    this.player.thermalCap = this.resolvedPlayerStats.config.thermalCap;
    this.player.vent = this.resolvedPlayerStats.config.vent;
    this.player.heat = Math.min(this.player.heat, this.player.thermalCap);
  }

  grantPlayerRewards(xpReward: number, scrapReward: number): void {
    const pendingBefore = this.progression.pendingLevelQueue.length;
    queueProgressionRewards(this.progression, xpReward, scrapReward);
    if (
      this.progression.pendingLevelQueue.length > pendingBefore &&
      this.levelUpPauseAt === null
    ) {
      this.levelUpPauseAt = this.elapsed + LEVEL_UP_PAUSE_DELAY_SECONDS;
    }
  }

  maybePauseForLevelUp(): void {
    if (!this.isPlaying()) {
      return;
    }

    if (!hasPendingLevelUp(this.progression)) {
      this.levelUpPauseAt = null;
      return;
    }

    const nextLevel = getNextPendingLevel(this.progression);
    if (!nextLevel) {
      return;
    }

    if (this.levelUpPauseAt === null) {
      this.levelUpPauseAt = this.elapsed + LEVEL_UP_PAUSE_DELAY_SECONDS;
    }

    if (this.elapsed < this.levelUpPauseAt) {
      return;
    }

    this.phase = "levelUp";
    this.levelUpPauseAt = null;
    this.keys.clear();
    this.primaryMouseDown = false;
    this.stopLoopedMovementAudio();
    this.refreshResolvedPlayerStats();
    const offers = generateLevelUpOffers(
      this.progression,
      nextLevel,
      this.resolvedPlayerStats.offerCount,
    );
    this.ui.showLevelUp(nextLevel, offers);
    this.ui.setGameplayCursorHidden(false);
  }

  handleLevelUpChoice(choiceIndex: number): void {
    if (this.phase !== "levelUp") {
      return;
    }

    const appliedOffer = applyLevelUpOffer(this.progression, choiceIndex);
    if (!appliedOffer) {
      return;
    }

    this.refreshResolvedPlayerStats();

    if (hasPendingLevelUp(this.progression)) {
      const nextLevel = getNextPendingLevel(this.progression);
      if (!nextLevel) {
        return;
      }
      const nextOffers = generateLevelUpOffers(
        this.progression,
        nextLevel,
        this.resolvedPlayerStats.offerCount,
      );
      this.ui.showLevelUp(nextLevel, nextOffers);
      this.updateHud();
      return;
    }

    this.phase = "playing";
    this.ui.hideLevelUp();
    this.ui.setGameplayCursorHidden(true);
    this.updateHud();
  }

  tryActivateActiveSkill(key: ActiveSkillKey): void {
    if (!this.isPlaying()) {
      return;
    }

    const activated = activateBoundActiveSkill(this.progression, key, this.elapsed);
    if (!activated) {
      return;
    }

    this.refreshResolvedPlayerStats();
  }

  createPlayer(): void {
    const createdPlayer = createPlayer(this.playerConfig, this.nextId++);
    this.player = createdPlayer.player;
    this.playerLines = createdPlayer.playerLines;
    this.playerShield = createdPlayer.playerShield;
    this.playerVentEffect = createdPlayer.playerVentEffect;
    this.scene.add(this.player.mesh);
    this.attachCollisionRing(this.player);

    this.cameraFocus.set(0, 0, 0);
    this.cameraTarget.set(0, 0, 0);
    this.cameraVelocity.set(0, 0, 0);
    this.updateCamera(0, true);
    this.updatePointerWorld();
  }

  spawnEnemy(name: EnemyShipName, position: THREE.Vector3): void {
    const definition = getEnemyShipDefinition(name);
    const createdEnemy = createEnemyShip(definition, this.nextId++, position);
    this.enemies.set(createdEnemy.enemy.id, createdEnemy.enemy);
    this.enemyShields.set(createdEnemy.enemy.id, createdEnemy.shield);
    this.scene.add(createdEnemy.enemy.mesh);
    this.attachCollisionRing(createdEnemy.enemy);
  }

  createAsteroid(
    size: AsteroidSize,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
  ): AsteroidEntity {
    const asteroidCfg = getAsteroidDefinition(size);
    const geometry = this.buildAsteroidGeometry(
      size === "medium" ? 18 : 13,
      asteroidCfg.radius * asteroidCfg.visualScale,
    );
    const material = new THREE.LineBasicMaterial({
      color: size === "medium" ? 0xaed4ff : 0x7ab4ff,
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
    this.attachCollisionRing(asteroid);
    return asteroid;
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

  animate = (): void => {
    requestAnimationFrame(this.animate);
    this.performanceMonitor.beginFrame();
    const delta = Math.min(this.clock.getDelta() || 0.016, 0.033);
    if (this.isPlaying()) {
      this.elapsed += delta;
      this.step(delta);
    }
    this.explosionSystem.update(delta);

    this.renderer.render(this.scene, this.camera);
    this.performanceMonitor.endFrame();
  };

  step(delta: number): void {
    syncExpiredActiveSkills(this.progression, this.elapsed);
    this.refreshResolvedPlayerStats();
    this.handleInput(delta);
    this.updateEnemyShips(delta);
    this.updateShipHeat(delta);
    this.updateShieldRegeneration(delta);
    this.updateAfterburner(delta);
    const { forward: cameraForward, right: cameraRight } = this.getCameraPlanarAxes();
    this.spawnDirector.update({
      delta,
      elapsed: this.elapsed,
      player: this.player,
      enemies: this.enemies.values(),
      cameraForward,
      cameraRight,
      getPlayerBounds: (distanceScreens) => this.getPlayerBounds(distanceScreens),
      spawnEnemy: (name, position) => this.spawnEnemy(name, position),
      createAsteroid: (size, position, velocity) => this.createAsteroid(size, position, velocity),
    });

    this.integratePlayer(delta);
    this.integrateEnemyShips(delta);
    this.thrusterParticles.update({
      delta,
      player: this.player,
      enemies: this.enemies.values(),
      playerThrusterInputState: this.thrusterInputState,
      afterburnerRamp: this.getAfterburnerParticleRamp(),
    });
    this.integrateAsteroids(delta);
    this.combat.updateProjectiles({
      delta,
      elapsed: this.elapsed,
      player: this.player,
      asteroids: [...this.asteroids.values()],
      enemies: [...this.enemies.values()],
      resolvedPlayerStats: this.resolvedPlayerStats,
    });
    for (const projectile of this.combat.getProjectilesSnapshot()) {
      this.syncCollisionRing(projectile);
    }
    this.handleObjectCollisions();
    this.cleanupFarObjects();
    this.updateCamera(delta, false);
    if (this.playerLines && this.player) {
      this.playerLines.material.color.setHex(0xffffff);
    }

    this.updateShieldEffect();
    this.syncEnemyInterceptDebug();
    this.maybePauseForLevelUp();
    this.updateHud();
    this.updateLoopedMovementAudio();
  }

  handleInput(delta: number): void {
    if (!this.player) {
      return;
    }

    const controlsLocked = this.resolvedPlayerStats.disableThrusters;
    const thrustingForward = !controlsLocked && this.keys.has("w");
    const thrustingReverse = !controlsLocked && this.keys.has("s");
    const strafingLeft = !controlsLocked && this.keys.has("a");
    const strafingRight = !controlsLocked && this.keys.has("d");
    const shiftHeld = !controlsLocked && this.keys.has("shift");
    const afterburnerEngaged = this.isAfterburnerEngaged(shiftHeld, thrustingForward);
    const boostedSpeedCap =
      this.resolvedPlayerStats.config.maxSpeed * this.afterburnerConfig.maxSpeedMultiplier;
    const decayPerSecond =
      (boostedSpeedCap - this.resolvedPlayerStats.config.maxSpeed) /
      this.afterburnerConfig.disengageDecaySeconds;
    if (afterburnerEngaged) {
      this.currentSpeedCap = boostedSpeedCap;
    } else {
      this.currentSpeedCap = Math.max(
        this.resolvedPlayerStats.config.maxSpeed,
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
    const targetYaw =
      !controlsLocked && toPointer.lengthSq() > 0.001 ? Math.atan2(toPointer.x, toPointer.z) : null;
    const playerIntent: ShipControlIntent = {
      targetYaw,
      forwardThrottle: thrustingForward ? 1 : 0,
      reverseThrottle: thrustingReverse ? 1 : 0,
      strafe: strafingLeft ? 1 : strafingRight ? -1 : 0,
      useAfterburner: afterburnerEngaged,
      firePrimary: false,
    };

    applyShipControl(this.player, this.resolvedPlayerStats.config, playerIntent, delta, {
      maxSpeedOverride: activeSpeedCap,
      forwardThrustMultiplier: afterburnerEngaged ? this.afterburnerConfig.thrustMultiplier : 1,
    });

    if (this.primaryMouseDown || this.resolvedPlayerStats.autoFireSelectedWeapon) {
      this.combat.tryFirePlayerPrimaryWeapon(this.player, this.resolvedPlayerStats, this.elapsed);
    }
  }

  integratePlayer(delta: number): void {
    if (!this.player) {
      return;
    }

    this.player.position.addScaledVector(this.player.velocity, delta);
    this.player.mesh.position.copy(this.player.position);
    this.syncCollisionRing(this.player);
  }

  updateEnemyShips(delta: number): void {
    if (!this.player) {
      return;
    }

    const asteroids = [...this.asteroids.values()];
    const projectiles = this.combat.getProjectilesSnapshot();
    const enemies = [...this.enemies.values()];

    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      const intent = updateEnemyAi(enemy, {
        player: this.player,
        asteroids,
        projectiles,
        enemies,
        elapsed: this.elapsed,
        delta,
      });
      this.syncEnemyThrusterState(enemy, intent);
      applyShipControl(enemy, enemy.definition, intent, delta, {
        preserveOverspeed: true,
      });

      if (intent.firePrimary) {
        const fired = this.combat.fireShipPrimaryWeapon(enemy, enemy.definition, {
          elapsed: this.elapsed,
          resolvedPlayerStats: this.resolvedPlayerStats,
        });
        if (fired) {
          const weaponName = getPrimaryFireWeapon(enemy.definition);
          if (!weaponName) {
            continue;
          }
          const weaponDefinition = getWeaponDefinition(weaponName);
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
      this.syncCollisionRing(enemy);
    }
  }

  integrateAsteroids(delta: number): void {
    for (const asteroid of this.asteroids.values()) {
      asteroid.position.addScaledVector(asteroid.velocity, delta);
      asteroid.mesh.position.copy(asteroid.position);
      asteroid.mesh.rotateOnAxis(asteroid.rotationAxis, asteroid.rotationSpeed * delta);
      this.syncCollisionRing(asteroid);
    }
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
        const restitution =
          first.type === "asteroid" && second.type === "asteroid"
            ? this.physicsConfig.asteroid_restitution
            : this.physicsConfig.restitution;

        if (impactCollision) {
          const impulseMagnitude =
            (-(1 + restitution) * separatingSpeed) / (1 / first.mass + 1 / second.mass);
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
        this.syncCollisionRing(first);
        this.syncCollisionRing(second);

        if (!impactCollision) {
          continue;
        }

        this.playPlayerCollisionSfx(first, second);
        this.combat.applyAsteroidCollisionDamage(
          first,
          second,
          this.elapsed,
          this.resolvedPlayerStats,
        );
      }
    }
  }

  playPlayerCollisionSfx(first: CollisionBody, second: CollisionBody): void {
    if (first.type !== "player" && second.type !== "player") {
      return;
    }

    this.audioSystem.playSfx("bump1", {
      volume: 1.5,
      offsetSeconds: 0.05,
    });
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
    this.combat.cleanupProjectilesOutsideBounds(this.player, projectileBounds);
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
      scrap: this.progression.scrap,
      gameplayVisible: this.isGameplayVisible(),
      crosshairVisible: this.isPlaying(),
      highXp: this.highestXp,
      statusLabel: this.getStatusLabel(),
      velocityX: this.player ? this.player.velocity.x : 0,
      velocityZ: this.player ? this.player.velocity.z : 0,
      performance: this.debugMode ? this.performanceMonitor.getSnapshot() : null,
    });
    const displayedLevel = getLevelForXp(this.progression.totalXp);
    const xpProgress = getXpProgressForLevel(this.progression.totalXp, displayedLevel);
    this.ui.updateProgression({
      level: displayedLevel,
      currentXp: this.progression.totalXp,
      levelStartXp: xpProgress.levelStartXp,
      nextLevelXp: xpProgress.nextLevelXp,
    });
    this.ui.updateEnemyTrackers(this.buildEnemyTrackerSnapshots());
    this.ui.updateEnemyTactics(this.buildEnemyTacticSnapshots());
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
      softCap: this.player ? this.getShipHeatSoftCap(this.player) : this.getConfigHeatSoftCap(),
      max: this.player?.thermalCap ?? this.playerConfig.thermalCap,
    });
  }

  buildEnemyTrackerSnapshots(): Array<{
    enemyId: number;
    screenX: number;
    screenY: number;
    angleDegrees: number;
    distanceUnits: number;
  }> {
    if (!this.isGameplayVisible() || !this.player) {
      return [];
    }

    const snapshots: Array<{
      enemyId: number;
      screenX: number;
      screenY: number;
      angleDegrees: number;
      distanceUnits: number;
    }> = [];

    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      const visibility = this.getEnemyScreenVisibility(enemy);
      const distanceUnits = Math.hypot(
        enemy.position.x - this.player.position.x,
        enemy.position.z - this.player.position.z,
      );
      const tracking = enemy.blackboard.screenTracking;
      const withinTrackerAutoMarkRadius = distanceUnits <= ENEMY_TRACK_AUTO_MARK_RADIUS;

      if (visibility.visible) {
        tracking.hasBeenSeen = true;
        tracking.lastSeenAt = this.elapsed;
        continue;
      }

      if (withinTrackerAutoMarkRadius) {
        tracking.hasBeenSeen = true;
        tracking.lastSeenAt = this.elapsed;
      }

      const trackingExpired =
        !tracking.hasBeenSeen ||
        this.elapsed - tracking.lastSeenAt > ENEMY_TRACK_PERSIST_SECONDS ||
        distanceUnits > ENEMY_TRACK_MAX_DISTANCE;

      if (trackingExpired) {
        tracking.hasBeenSeen = false;
        continue;
      }

      const clampedNdc = this.clampNdcToScreenEdge(visibility.ndc);
      snapshots.push({
        enemyId: enemy.id,
        screenX: ((clampedNdc.x + 1) * this.viewport.x) / 2,
        screenY: ((1 - clampedNdc.y) * this.viewport.y) / 2,
        angleDegrees: THREE.MathUtils.radToDeg(Math.atan2(-clampedNdc.y, clampedNdc.x)),
        distanceUnits,
      });
    }

    return snapshots;
  }

  buildEnemyTacticSnapshots(): Array<{
    enemyId: number;
    screenX: number;
    screenY: number;
    tactic: string;
  }> {
    if (!this.showEnemyTactic || !this.isGameplayVisible()) {
      return [];
    }

    const snapshots: Array<{
      enemyId: number;
      screenX: number;
      screenY: number;
      tactic: string;
    }> = [];

    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      const visibility = this.getEnemyScreenVisibility(enemy);
      if (!visibility.visible) {
        continue;
      }

      snapshots.push({
        enemyId: enemy.id,
        screenX: ((visibility.ndc.x + 1) * this.viewport.x) / 2,
        screenY: ((1 - visibility.ndc.y) * this.viewport.y) / 2 - ENEMY_TACTIC_LABEL_SCREEN_OFFSET_PX,
        tactic: enemy.blackboard.currentTactic,
      });
    }

    return snapshots;
  }

  getEnemyScreenVisibility(enemy: EnemyShipEntity): {
    visible: boolean;
    ndc: THREE.Vector2;
  } {
    const projected = enemy.position.clone().project(this.camera);
    const cameraSpace = enemy.position.clone().applyMatrix4(this.camera.matrixWorldInverse);
    const ndc = new THREE.Vector2(projected.x, projected.y);
    const inFrontOfCamera = cameraSpace.z < 0;
    const visible =
      inFrontOfCamera &&
      projected.z >= -1 &&
      projected.z <= 1 &&
      Math.abs(projected.x) <= 1 &&
      Math.abs(projected.y) <= 1;

    if (!inFrontOfCamera) {
      ndc.multiplyScalar(-1);
    }

    if (ndc.lengthSq() <= 0.0001) {
      ndc.set(0, -1);
    }

    return { visible, ndc };
  }

  clampNdcToScreenEdge(ndc: THREE.Vector2): THREE.Vector2 {
    const direction = ndc.lengthSq() > 0.0001 ? ndc.clone() : new THREE.Vector2(0, -1);
    const scale = Math.min(
      ENEMY_TRACK_EDGE_NDC_X / Math.max(Math.abs(direction.x), 0.0001),
      ENEMY_TRACK_EDGE_NDC_Y / Math.max(Math.abs(direction.y), 0.0001),
    );

    return direction.multiplyScalar(scale);
  }

  updateLoopedMovementAudio(): void {
    const playerUsingThrusters = THRUSTER_NAMES.some((name) => this.thrusterInputState[name]);
    if (this.isPlaying() && this.player && playerUsingThrusters) {
      this.audioSystem.playLoop(PLAYER_THRUSTER_LOOP_ID, "thrustersLongLoop", {
        volume: PLAYER_THRUSTER_AUDIO_VOLUME,
      });
    } else {
      this.audioSystem.stopLoop(PLAYER_THRUSTER_LOOP_ID);
    }

    if (this.isPlaying() && this.player && this.afterburnerActive) {
      this.audioSystem.playLoop(PLAYER_AFTERBURNER_LOOP_ID, "afterburnerLoop", {
        volume: PLAYER_AFTERBURNER_AUDIO_VOLUME,
      });
    } else {
      this.audioSystem.stopLoop(PLAYER_AFTERBURNER_LOOP_ID);
    }

    if (!this.isPlaying() || !this.player) {
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

  updateShipHeat(delta: number): void {
    if (this.player) {
      if (this.resolvedPlayerStats.emergencyVentHeatPerSecond > 0) {
        this.player.heat = Math.max(
          0,
          this.player.heat - this.resolvedPlayerStats.emergencyVentHeatPerSecond * delta,
        );
      } else {
        this.ventShipHeat(this.player, delta);
      }
    }

    for (const enemy of this.enemies.values()) {
      if (!enemy.alive) {
        continue;
      }

      this.ventShipHeat(enemy, delta);
    }
  }

  updateShieldRegeneration(delta: number): void {
    if (this.player && !this.resolvedPlayerStats.disableShield) {
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
    const softCap = this.getShipHeatSoftCap(ship);
    const ventMultiplier = ship.heat >= softCap ? OVERHEATED_VENT_MULTIPLIER : 1;
    ship.heat = Math.max(0, ship.heat - ship.vent * ventMultiplier * delta);
  }

  getShipHeatSoftCap(ship: Pick<ShipEntity, "thermalCap">): number {
    return Math.floor(ship.thermalCap * 2 / 3);
  }

  getConfigHeatSoftCap(): number {
    return Math.floor(this.resolvedPlayerStats.config.thermalCap * 2 / 3);
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
    this.syncCollisionRing(asteroid);

    const speed = asteroid.velocity.length();
    if (speed > 0.001) {
      const headingRadians = Math.random() * Math.PI * 2;
      asteroid.velocity.set(Math.sin(headingRadians) * speed, 0, Math.cos(headingRadians) * speed);
    }
  }

  destroyAsteroid(asteroid: AsteroidEntity, emitExplosion = true): void {
    asteroid.alive = false;
    this.asteroids.delete(asteroid.id);
    this.removeCollisionRing(asteroid.id);
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
    this.enemyShields.delete(enemy.id);
    this.removeCollisionRing(enemy.id);
    this.removeEnemyInterceptLine(enemy.id);
    this.audioSystem.stopLoop(this.getEnemyThrusterLoopId(enemy.id));
    if (emitExplosion) {
      this.playExplosionSfx();
      this.spawnExplosion(enemy.position, enemy.radius, enemy.definition.lineColor, enemy.velocity);
    }
    this.scene.remove(enemy.mesh);
  }

  clearEntities(): void {
    this.stopLoopedMovementAudio();
    for (const asteroid of this.asteroids.values()) {
      this.scene.remove(asteroid.mesh);
    }
    for (const enemy of this.enemies.values()) {
      this.scene.remove(enemy.mesh);
    }
    this.combat.clearProjectiles();
    this.asteroids.clear();
    this.enemies.clear();
    this.enemyShields.clear();
    this.collisionRings.clear();
    this.collisionRingRoot.clear();
    this.clearEnemyInterceptLines();
    this.ui.updateEnemyTrackers([]);
    this.ui.updateEnemyTactics([]);

    if (this.player) {
      this.scene.remove(this.player.mesh);
    }
    this.player = null;
    this.playerLines = null;
    this.playerShield = null;
    this.playerVentEffect = null;
    this.primaryMouseDown = false;
    for (const key of THRUSTER_NAMES) {
      this.thrusterInputState[key] = false;
    }
    this.afterburnerActive = false;
    this.afterburnerShiftHeld = false;
    this.afterburnerEffectTime = 0;
    this.thrusterParticles.reset();
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
    this.removeCollisionRing(player.id);
    this.scene.remove(player.mesh);
    this.player = null;
    this.playerLines = null;
    this.playerShield = null;
    this.playerVentEffect = null;
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

  getWorldViewHeight(): number {
    return this.cameraRig.getWorldViewHeight();
  }

  getCameraHeight(): number {
    return this.cameraRig.getCameraHeight();
  }

  getCameraLookDirection(): THREE.Vector3 {
    return this.player ? this.cameraRig.getLookDirection(this.player) : new THREE.Vector3(0, 0, -1);
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
    if (this.player && this.playerShield) {
      this.updateShieldMesh(this.player, this.playerShield);
    }

    for (const enemy of this.enemies.values()) {
      const shield = this.enemyShields.get(enemy.id);
      if (!shield) {
        continue;
      }

      this.updateShieldMesh(enemy, shield);
    }

    this.updateEmergencyVentEffect();
  }

  updateShieldMesh(ship: ShipEntity, shieldMesh: PlayerShield): void {
    if (ship.maxShield <= 0 || ship.shield <= 0) {
      shieldMesh.visible = false;
      return;
    }

    if (ship.type === "player" && this.resolvedPlayerStats.disableShield) {
      shieldMesh.visible = false;
      return;
    }

    const shieldMaterial = shieldMesh.material;
    const shieldRatio = ship.shield / Math.max(ship.maxShield, 1);
    const recentlyHit = ship.shieldRegenCooldownUntil > this.elapsed;
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

    shieldMesh.visible = true;
    shieldMesh.scale.setScalar(1 + pulse * 0.04);
    shieldMaterial.opacity = (fullShieldOpacity + hitBoost) * opacityStepMultiplier;
    shieldMaterial.color.setHex(recentlyHit ? hitColor : baseColor);
  }

  isEnemyWithinPlayerXpRewardRadius(enemy: EnemyShipEntity): boolean {
    if (!this.player || !this.player.alive) {
      return false;
    }

    return (
      this.player.position.distanceToSquared(enemy.position) <=
      PLAYER_ENEMY_PROXIMITY_XP_RADIUS * PLAYER_ENEMY_PROXIMITY_XP_RADIUS
    );
  }

  updateEmergencyVentEffect(): void {
    if (!this.playerVentEffect) {
      return;
    }

    if (!this.showEmergencyVentEffect) {
      hideEmergencyVentEffect(this.playerVentEffect);
      return;
    }

    const ventRuntime = this.progression.activeSkillRuntimes.emergencyVent;
    const currentTier = this.progression.ownedSkillTiers.emergencyVent ?? 0;
    if (
      !ventRuntime ||
      ventRuntime.activeUntil <= this.elapsed ||
      currentTier <= 0
    ) {
      hideEmergencyVentEffect(this.playerVentEffect);
      return;
    }

    const activeEffect =
      getPlayerSkillDefinition("emergencyVent").tiers[currentTier - 1]?.activeEffect ?? null;
    if (!activeEffect) {
      hideEmergencyVentEffect(this.playerVentEffect);
      return;
    }

    const progress = THREE.MathUtils.clamp(
      1 - (ventRuntime.activeUntil - this.elapsed) / activeEffect.durationSeconds,
      0,
      1,
    );
    updateEmergencyVentEffectVisual(this.playerVentEffect, this.elapsed, progress);
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

  syncEnemyThrusterState(enemy: EnemyShipEntity, intent: ShipControlIntent): void {
    enemy.thrusterState.inputState.forward = intent.forwardThrottle > 0.1;
    enemy.thrusterState.inputState.reverse = intent.reverseThrottle > 0.1;
    enemy.thrusterState.inputState.left = intent.strafe > 0.1;
    enemy.thrusterState.inputState.right = intent.strafe < -0.1;
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
