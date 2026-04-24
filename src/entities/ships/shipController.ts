import * as THREE from "three";
import type { ShipControlIntent, ShipEntity, ShipMovementConfig } from "../../types";

export interface ShipControlOptions {
  maxSpeedOverride?: number;
  forwardThrustMultiplier?: number;
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

  if (intent.forwardThrottle > 0) {
    ship.velocity.addScaledVector(
      forward,
      config.thrust *
        THREE.MathUtils.clamp(intent.forwardThrottle, 0, 1) *
        forwardThrustMultiplier *
        delta,
    );
  }

  if (intent.reverseThrottle > 0) {
    ship.velocity.addScaledVector(
      forward,
      -config.reverseThrust * THREE.MathUtils.clamp(intent.reverseThrottle, 0, 1) * delta,
    );
  }

  if (Math.abs(intent.strafe) > 0.001) {
    applyAxisThrustToShip(
      ship,
      right,
      config.strafeThrust * THREE.MathUtils.clamp(intent.strafe, -1, 1) * delta,
      config.strafeMaxSpeed,
    );
  }

  const speed = ship.velocity.length();
  if (speed > activeSpeedCap) {
    ship.velocity.setLength(activeSpeedCap);
  }

  if (intent.targetYaw !== null) {
    const difference = wrapAngle(intent.targetYaw - ship.yaw);
    ship.yawVelocity += difference * config.turnRate * delta;
    ship.yawVelocity *= Math.exp(-config.turnDamping * delta);
    ship.yaw += ship.yawVelocity * delta;
    ship.mesh.rotation.y = ship.yaw;
  }
}

export function applyAxisThrustToShip(
  ship: ShipEntity,
  axis: THREE.Vector3,
  deltaSpeed: number,
  maxAxisSpeed: number,
): void {
  if (deltaSpeed === 0) {
    return;
  }

  const axisSpeed = ship.velocity.dot(axis);
  const thrustSign = Math.sign(deltaSpeed);
  const axisSign = Math.sign(axisSpeed);

  if (axisSign !== 0 && axisSign === thrustSign && Math.abs(axisSpeed) >= maxAxisSpeed) {
    return;
  }

  let appliedDelta = deltaSpeed;
  if (axisSign === thrustSign || axisSign === 0) {
    const remainingSpeed = maxAxisSpeed - Math.abs(axisSpeed);
    appliedDelta = thrustSign * Math.min(Math.abs(deltaSpeed), Math.max(remainingSpeed, 0));
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
