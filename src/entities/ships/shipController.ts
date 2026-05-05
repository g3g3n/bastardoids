import * as THREE from "three";
import type { ShipControlIntent, ShipEntity, ShipMovementConfig } from "../../types";

export interface ShipControlOptions {
  maxSpeedOverride?: number;
  forwardThrustMultiplier?: number;
  preserveOverspeed?: boolean;
}

export interface ShipBasis {
  forward: THREE.Vector3;
  right: THREE.Vector3;
}

export function getShipBasis(yaw: number): ShipBasis {
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  return {
    forward,
    right: new THREE.Vector3(forward.z, 0, -forward.x),
  };
}

export function applyShipControl(
  ship: ShipEntity,
  config: ShipMovementConfig,
  intent: ShipControlIntent,
  delta: number,
  options: ShipControlOptions = {},
): void {
  const { forward, right } = getShipBasis(ship.yaw);
  const activeSpeedCap = options.maxSpeedOverride ?? config.maxSpeed;
  const forwardThrustMultiplier = options.forwardThrustMultiplier ?? 1;
  const startingSpeed = ship.velocity.length();

  if (intent.forwardThrottle > 0) {
    applyAxisThrustToShip(
      ship,
      forward,
      (config.thrust / ship.mass) *
        THREE.MathUtils.clamp(intent.forwardThrottle, 0, 1) *
        forwardThrustMultiplier *
        delta,
      activeSpeedCap,
      config.speedCapCurveExponent,
    );
  }

  if (intent.reverseThrottle > 0) {
    applyAxisThrustToShip(
      ship,
      forward,
      -(config.reverseThrust / ship.mass) *
        THREE.MathUtils.clamp(intent.reverseThrottle, 0, 1) *
        delta,
      activeSpeedCap,
      config.speedCapCurveExponent,
    );
  }

  if (Math.abs(intent.strafe) > 0.001) {
    applyAxisThrustToShip(
      ship,
      right,
      (config.strafeThrust / ship.mass) * THREE.MathUtils.clamp(intent.strafe, -1, 1) * delta,
      config.strafeMaxSpeed,
      config.speedCapCurveExponent,
    );
  }

  const speed = ship.velocity.length();
  const allowedSpeed = options.preserveOverspeed
    ? Math.max(activeSpeedCap, startingSpeed)
    : activeSpeedCap;
  if (speed > allowedSpeed) {
    ship.velocity.setLength(allowedSpeed);
  }

  if (intent.targetYaw !== null) {
    const difference = wrapAngle(intent.targetYaw - ship.yaw);
    const yawInertia = Math.max(
      ship.mass * ship.radius * ship.radius * config.yawInertiaFactor,
      0.0001,
    );
    const yawAcceleration = (difference * config.turnRate - config.turnDamping * ship.yawVelocity) / yawInertia;
    ship.yawVelocity += yawAcceleration * delta;
    ship.yaw += ship.yawVelocity * delta;
    ship.mesh.rotation.y = ship.yaw;
  }
}

export function applyAxisThrustToShip(
  ship: ShipEntity,
  axis: THREE.Vector3,
  deltaSpeed: number,
  maxAxisSpeed: number,
  speedCapCurveExponent: number,
): void {
  if (deltaSpeed === 0) {
    return;
  }

  const axisSpeed = ship.velocity.dot(axis);
  const thrustSign = Math.sign(deltaSpeed);
  const axisSign = Math.sign(axisSpeed);

  let appliedDelta = deltaSpeed;

  if (maxAxisSpeed > 0 && axisSign !== 0 && axisSign === thrustSign) {
    const normalized = THREE.MathUtils.clamp(Math.abs(axisSpeed) / maxAxisSpeed, 0, 1);
    const falloff = Math.pow(1 - normalized, speedCapCurveExponent);
    appliedDelta *= falloff;
  }

  if (appliedDelta === 0) {
    return;
  }

  if (maxAxisSpeed > 0 && axisSign === thrustSign) {
    const nextAxisSpeed = axisSpeed + appliedDelta;
    if (Math.abs(nextAxisSpeed) > maxAxisSpeed) {
      const remainingSpeed = Math.max(maxAxisSpeed - Math.abs(axisSpeed), 0);
      appliedDelta = thrustSign * Math.min(Math.abs(appliedDelta), remainingSpeed);
    }
  }

  ship.velocity.addScaledVector(axis, appliedDelta);
}

export function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) {
    wrapped -= Math.PI * 2;
  }
  while (wrapped < -Math.PI) {
    wrapped += Math.PI * 2;
  }
  return wrapped;
}
