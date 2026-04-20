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
  Vector3,
} from "three";

export type AsteroidSize = "large" | "small";
export type ThrusterName = "forward" | "reverse" | "left" | "right";

export interface WorldConfig {
  asteroidDistanceScreens: number;
  cameraFovDegrees: number;
  cameraPitchDegrees: number;
  cameraDistance: number;
  cameraHeight: number;
  cameraLookAhead: number;
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

export interface PlayerConfig {
  mass: number;
  lives: number;
  radius: number;
  thrust: number;
  reverseThrust: number;
  strafeThrust: number;
  maxSpeed: number;
  strafeMaxSpeed: number;
  visualScale: number;
  turnRate: number;
  turnDamping: number;
  invulnerabilitySeconds: number;
  muzzleOffsetForward: number;
  muzzleOffsetSide: number;
}

export interface LaserConfig {
  shotsPerSecond: number;
  speed: number;
  lifetimeSeconds: number;
  radius: number;
  visualLength: number;
  visualWidth: number;
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

export interface AsteroidSizeConfig {
  mass: number;
  radius: number;
  minSpeed: number;
  maxSpeed: number;
  rotationSpeedMin: number;
  rotationSpeedMax: number;
}

export interface AsteroidsConfig {
  large: AsteroidSizeConfig;
  small: AsteroidSizeConfig;
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
  world: WorldConfig;
  player: PlayerConfig;
  laser: LaserConfig;
  thrusters: ThrusterConfig;
  afterburner: AfterburnerConfig;
  asteroids: AsteroidsConfig;
  spawning: SpawningConfig;
  physics: PhysicsConfig;
}

export interface PlayerState {
  id: number;
  type: "player";
  mass: number;
  radius: number;
  mesh: Group;
  position: Vector3;
  velocity: Vector3;
  yaw: number;
  yawVelocity: number;
  invulnerableUntil: number;
  alive: boolean;
}

export interface AsteroidEntity {
  id: number;
  type: "asteroid";
  size: AsteroidSize;
  mass: number;
  radius: number;
  mesh: LineSegments<BufferGeometry, LineBasicMaterial>;
  position: Vector3;
  velocity: Vector3;
  rotationAxis: Vector3;
  rotationSpeed: number;
  alive: boolean;
}

export interface LaserEntity {
  id: number;
  type: "laser";
  mass: number;
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
}

export interface ThrusterEmitter {
  position: Vector3;
  direction: Vector3;
  tangent: Vector3;
  normal: Vector3;
  name: ThrusterName;
}

export interface ReferenceGridBounds {
  halfWidth: number;
  halfDepth: number;
}

export type CollisionBody = PlayerState | AsteroidEntity;
export type ThrusterStateMap<T> = Record<ThrusterName, T>;
export type BackgroundStarTile = Points<BufferGeometry, PointsMaterial>;
export type ReferenceGridTile = Group;
export type PlayerLines = LineSegments<BufferGeometry, LineBasicMaterial>;
export type PlayerShield = Mesh<SphereGeometry, MeshBasicMaterial>;
