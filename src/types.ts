import type {
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  SphereGeometry,
  Sprite,
  Vector3,
} from "three";

export type AsteroidSize = "medium" | "small";
export type ThrusterName = "forward" | "reverse" | "left" | "right";
export type ShipModelName =
  | "ship1"
  | "ship2"
  | "ship3"
  | "ship4"
  | "ship5"
  | "ship6"
  | "ship7"
  | "ship8"
  | "ship9";
export type WeaponName = "laser" | "kineticTorpedo" | "plasmaOrb";
export type WeaponVisualName = "laserBolt" | "kineticTorpedo" | "plasmaOrb";
export type SoundEffectName =
  | "afterburnerLoop"
  | "bump1"
  | "crash1"
  | "explosion1"
  | "explosion2"
  | "laserHit"
  | "laserShot1"
  | "plasmaOrbShot1"
  | "thrustersLongLoop";
export type Faction = "player" | "enemy";
export type EnemyShipName = "Hunter T" | "Hunter L" | "Hunter P";
export type EnemyTactic =
  | "closeToRange"
  | "holdRange"
  | "orbitLeft"
  | "orbitRight"
  | "breakAway"
  | "evadePlayerCollision"
  | "evadeObjectCollision"
  | "dodgeProjectile"
  | "repositionBehind"
  | "returnToSpawn";
export type VectorTuple = readonly [number, number, number];

export interface ShipModelDefinition {
  name: ShipModelName;
  segments: ReadonlyArray<readonly [VectorTuple, VectorTuple]>;
}

export interface WorldConfig {
  asteroidDistanceScreens: number;
  asteroidDespawnDistanceScreens: number;
  asteroidWrapHeadingJitterDegrees: number;
  asteroidWrapPositionJitterFraction: number;
  cameraFovDegrees: number;
  cameraNear: number;
  cameraFar: number;
  cameraPitchDegrees: number;
  cameraDistance: number;
  cameraHeight: number;
  cameraLookAhead: number;
  cameraFacingWeight: number;
  cameraLookAheadAlignmentExponent: number;
  cameraTetherStrength: number;
  cameraTetherDamping: number;
  cameraMaxSpeed: number;
  gridCellSize: number;
  gridMajorEvery: number;
  backgroundStarsPerTile: number;
  backgroundStarHeightMin: number;
  backgroundStarHeightMax: number;
  backgroundStarSize: number;
}

export interface ShipMovementConfig {
  hullMass: number;
  radius: number;
  vent: number;
  thermalCap: number;
  thrust: number;
  reverseThrust: number;
  strafeThrust: number;
  maxSpeed: number;
  strafeMaxSpeed: number;
  shipModel: ShipModelName;
  weapon1: WeaponName | null;
  visualScale: number;
  turnRate: number;
  turnDamping: number;
  yawInertiaFactor: number;
  speedCapCurveExponent: number;
  enginePowerMw?: number;
  muzzleOffsetForward: number;
  muzzleOffsetSide: number;
}

export interface PlayerConfig extends ShipMovementConfig {
  hull: number;
  shield: number;
  shieldRegen: number;
  shieldRegenDelaySeconds: number;
}

export interface WeaponDefinition {
  name: WeaponName;
  visual: WeaponVisualName;
  fireSound?: SoundEffectName;
  hitSound?: SoundEffectName;
  hitVolumeAgainstAsteroid?: number;
  hitVolumeAgainstShip?: number;
  hitSoundOffsetSeconds?: number;
  hitSoundPlaybackRate?: number;
  heat: number;
  shotsPerSecond: number;
  speed: number;
  lifetimeSeconds: number;
  damage: number;
  radius: number;
  mass: number;
  projectileMass: number;
  visualLength: number;
  visualWidth: number;
}

export interface ShipControlIntent {
  targetYaw: number | null;
  forwardThrottle: number;
  reverseThrottle: number;
  strafe: number;
  useAfterburner: boolean;
  firePrimary: boolean;
}

export interface ThrusterConfig {
  maxParticles: number;
  particleSize: number;
  buildupSeconds: number;
  minParticlesPerSecond: number;
  maxParticlesPerSecond: number;
  minLifetimeSeconds: number;
  maxLifetimeSeconds: number;
  minSpeed: number;
  maxSpeed: number;
  minSpread: number;
  maxSpread: number;
  spawnJitter: number;
  forwardOffset: number;
  forwardSideOffset: number;
  reverseOffset: number;
  reverseSideOffset: number;
  sideOffset: number;
  sideForwardOffset: number;
}

export interface AfterburnerConfig {
  thrustMultiplier: number;
  maxSpeedMultiplier: number;
  maxDurationSeconds: number;
  rechargeSeconds: number;
  disengageDecaySeconds: number;
  particleDensityMultiplier: number;
  particleLengthMultiplier: number;
  particleRampSeconds: number;
}

export interface AsteroidDefinition {
  mass: number;
  radius: number;
  visualScale: number;
  maxHull: number;
  xpReward: number;
  scrapReward: number;
  minSpeed: number;
  maxSpeed: number;
  rotationSpeedMin: number;
  rotationSpeedMax: number;
}

export interface SpawningConfig {
  basePerEightSeconds: number;
  increaseEverySeconds: number;
  increasePerEightSeconds: number;
  jitterSeconds: number;
}

export interface PhysicsConfig {
  restitution: number;
  separationBias: number;
}

export interface GameConfig {
  debugMode: boolean;
  showCollisionRings: boolean;
  showEmergencyVentEffect: boolean;
  world: WorldConfig;
  player: PlayerConfig;
  thrusters: ThrusterConfig;
  afterburner: AfterburnerConfig;
  spawning: SpawningConfig;
  physics: PhysicsConfig;
}

export interface ShipStateBase {
  id: number;
  mass: number;
  radius: number;
  vent: number;
  thermalCap: number;
  heat: number;
  maxHull: number;
  hull: number;
  maxShield: number;
  shield: number;
  shieldRegen: number;
  shieldRegenDelaySeconds: number;
  shieldRegenCooldownUntil: number;
  faction: Faction;
  mesh: Group;
  position: Vector3;
  velocity: Vector3;
  yaw: number;
  yawVelocity: number;
  alive: boolean;
}

export interface PlayerState extends ShipStateBase {
  type: "player";
  faction: "player";
}

export interface EnemyShipDefinition extends ShipMovementConfig {
  name: EnemyShipName;
  maxHull: number;
  shield: number;
  shieldRegen: number;
  shieldRegenDelaySeconds: number;
  engageRadius: number;
  fireRadius: number;
  preferredRangeMin: number;
  preferredRangeMax: number;
  decisionInterval: number;
  farDecisionInterval: number;
  aimToleranceDegrees: number;
  avoidanceWeight: number;
  orbitWeight: number;
  behindWeight: number;
  projectileAvoidanceWeight: number;
  separationWeight: number;
  tacticLockSeconds: number;
  pursuitLoseSeconds: number;
  returnHomeRadius: number;
  xpReward: number;
  scrapReward: number;
  lineColor: number;
}

export interface EnemyPerceptionSnapshot {
  distanceToPlayer: number;
  relativeBearing: number;
  playerVelocity: Vector3;
  nearestAsteroidThreatDistance: number;
  nearestAsteroidThreatPosition: Vector3 | null;
  nearestProjectileThreatDistance: number;
  nearestProjectileThreatPosition: Vector3 | null;
  nearestEnemySeparationDistance: number;
  nearestEnemySeparationPosition: Vector3 | null;
  timeToCollisionPlayer: number;
  timeToCollisionAsteroid: number;
}

export interface EnemyScreenTrackingState {
  hasBeenSeen: boolean;
  lastSeenAt: number;
}

export interface EnemyBlackboard {
  preferredRange: number;
  orbitDirection: -1 | 1;
  slotAngle: number;
  currentTactic: EnemyTactic;
  engaged: boolean;
  disengageAt: number;
  decisionLockUntil: number;
  nextDecisionAt: number;
  nextPerceptionUpdateAt: number;
  nextFireAt: number;
  spawnPoint: Vector3;
  perception: EnemyPerceptionSnapshot;
  screenTracking: EnemyScreenTrackingState;
}

export interface ShipThrusterRuntime {
  inputState: ThrusterStateMap<boolean>;
  holdTime: ThrusterStateMap<number>;
  emissionCarry: ThrusterStateMap<number>;
}

export interface EnemyShipEntity extends ShipStateBase {
  type: "enemyShip";
  faction: "enemy";
  name: EnemyShipName;
  definition: EnemyShipDefinition;
  blackboard: EnemyBlackboard;
  thrusterState: ShipThrusterRuntime;
}

export interface AsteroidEntity {
  id: number;
  type: "asteroid";
  mass: number;
  radius: number;
  maxHull: number;
  hull: number;
  maxShield: number;
  shield: number;
  shieldRegen: number;
  shieldRegenDelaySeconds: number;
  shieldRegenCooldownUntil: number;
  mesh: LineSegments<BufferGeometry, LineBasicMaterial>;
  position: Vector3;
  velocity: Vector3;
  size: AsteroidSize;
  rotationAxis: Vector3;
  rotationSpeed: number;
  alive: boolean;
}

export interface ProjectileEntity {
  id: number;
  type: "projectile";
  ownerId: number;
  weapon: WeaponName;
  faction: Faction;
  mass: number;
  damage: number;
  radius: number;
  mesh: Group;
  position: Vector3;
  velocity: Vector3;
  expiresAt: number;
  alive: boolean;
}

export interface ThrusterParticle {
  active: boolean;
  position: Vector3;
  velocity: Vector3;
  age: number;
  lifetime: number;
  whiteness: number;
}

export interface ThrusterEmitter {
  position: Vector3;
  direction: Vector3;
  tangent: Vector3;
  normal: Vector3;
  name: ThrusterName;
}

export interface VentCloudLayer {
  sprite: Sprite;
  pulseOffset: number;
  scaleFactor: number;
  driftSpeed: number;
}

export interface VentCloudPuff {
  sprite: Sprite;
  angleOffset: number;
  radiusFactor: number;
  scaleFactor: number;
  driftSpeed: number;
  spinSpeed: number;
  pulseOffset: number;
  verticalOffset: number;
}

export interface PlayerVentEffect {
  root: Group;
  shipRadius: number;
  hazeLayers: VentCloudLayer[];
  puffs: VentCloudPuff[];
}

export interface ReferenceGridBounds {
  halfWidth: number;
  halfDepth: number;
}

export type CollisionBody = PlayerState | EnemyShipEntity | AsteroidEntity;
export type DamageableEntity = CollisionBody;
export type ShipEntity = PlayerState | EnemyShipEntity;
export type ThrusterStateMap<T> = Record<ThrusterName, T>;
export type BackgroundStarTile = Points<BufferGeometry, PointsMaterial>;
export type ReferenceGridTile = Group;
export type ShipLines = LineSegments<BufferGeometry, LineBasicMaterial>;
export type PlayerLines = ShipLines;
export type PlayerShield = Mesh<SphereGeometry, MeshBasicMaterial>;
