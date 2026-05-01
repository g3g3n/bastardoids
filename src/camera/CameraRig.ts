import * as THREE from "three";
import type { PlayerState, ReferenceGridBounds, WorldConfig } from "../types";

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  focus = new THREE.Vector3();
  target = new THREE.Vector3();
  velocity = new THREE.Vector3();
  world: WorldConfig;

  constructor(world: WorldConfig) {
    this.world = world;
    this.camera = new THREE.PerspectiveCamera(
      world.cameraFovDegrees ?? 58,
      1,
      world.cameraNear,
      world.cameraFar,
    );
  }

  resize(viewport: THREE.Vector2, renderer: THREE.WebGLRenderer): void {
    this.camera.aspect = viewport.x / viewport.y;
    this.camera.updateProjectionMatrix();
    renderer.setSize(viewport.x, viewport.y);
  }

  update(player: PlayerState | null, delta: number, force: boolean): void {
    if (!player) {
      return;
    }

    const lookDirection = this.getLookDirection(player);
    const lookAheadFactor = this.getLookAheadFactor(player);
    this.target
      .copy(player.position)
      .addScaledVector(lookDirection, this.world.cameraLookAhead * lookAheadFactor);
    this.target.y = 0;

    if (force) {
      this.focus.copy(this.target);
      this.velocity.set(0, 0, 0);
    } else {
      const springOffset = this.target.clone().sub(this.focus);
      springOffset.y = 0;
      this.velocity.addScaledVector(springOffset, this.world.cameraTetherStrength * delta);
      this.velocity.multiplyScalar(Math.exp(-this.world.cameraTetherDamping * delta));

      const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (horizontalSpeed > this.world.cameraMaxSpeed) {
        const scale = this.world.cameraMaxSpeed / horizontalSpeed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }

      this.focus.addScaledVector(this.velocity, delta);
      this.focus.y = 0;
    }

    this.camera.position.set(this.focus.x, this.getCameraHeight(), this.focus.z + this.world.cameraDistance);
    this.camera.lookAt(this.focus);
  }

  getViewBounds(): ReferenceGridBounds {
    const viewHeight = this.getWorldViewHeight();
    const viewWidth = viewHeight * this.camera.aspect;
    return {
      halfWidth: viewWidth / 2,
      halfDepth: viewHeight / 2,
    };
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

  getLookDirection(player: PlayerState): THREE.Vector3 {
    const facingDirection = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const velocityDirection = player.velocity.clone().setY(0);
    if (velocityDirection.lengthSq() <= 1) {
      return facingDirection;
    }

    velocityDirection.normalize();
    const blendedDirection = velocityDirection.addScaledVector(
      facingDirection,
      this.world.cameraFacingWeight,
    );
    if (blendedDirection.lengthSq() <= 0.0001) {
      return facingDirection;
    }

    return blendedDirection.normalize();
  }

  getLookAheadFactor(player: PlayerState): number {
    const facingDirection = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    const velocityDirection = player.velocity.clone().setY(0);
    if (velocityDirection.lengthSq() <= 1) {
      return 1;
    }

    velocityDirection.normalize();
    const alignment = THREE.MathUtils.clamp(
      velocityDirection.dot(facingDirection),
      -1,
      1,
    );
    const normalizedAlignment = (alignment + 1) * 0.5;
    return Math.pow(
      THREE.MathUtils.clamp(normalizedAlignment, 0, 1),
      this.world.cameraLookAheadAlignmentExponent,
    );
  }
}
