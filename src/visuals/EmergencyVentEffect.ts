import * as THREE from "three";
import type { PlayerVentEffect, VentCloudLayer, VentCloudPuff } from "../types";

const CORE_LAYER_COUNT = 4;
const PUFF_COUNT = 22;
const VENT_ORIGIN_RING_FRACTION = 2 / 3;
const BRIGHT_CLOUD_COLOR = new THREE.Color(0xf8fbff);
const MID_CLOUD_COLOR = new THREE.Color(0xd7e0e8);
const DIM_CLOUD_COLOR = new THREE.Color(0xb6c0ca);

let emergencyVentTexture: THREE.CanvasTexture | null = null;

export function createEmergencyVentEffect(shipRadius: number): PlayerVentEffect {
  const root = new THREE.Group();
  root.visible = false;

  const texture = getEmergencyVentTexture();
  const hazeLayers: VentCloudLayer[] = [];
  const puffs: VentCloudPuff[] = [];

  for (let index = 0; index < CORE_LAYER_COUNT; index += 1) {
    const sprite = createVentSprite(texture, BRIGHT_CLOUD_COLOR);
    root.add(sprite);
    hazeLayers.push({
      sprite,
      pulseOffset: Math.random() * Math.PI * 2,
      scaleFactor: 1.08 + index * 0.38 + Math.random() * 0.2,
      driftSpeed: 0.18 + Math.random() * 0.2,
    });
  }

  for (let index = 0; index < PUFF_COUNT; index += 1) {
    const sprite = createVentSprite(texture, MID_CLOUD_COLOR.clone().lerp(DIM_CLOUD_COLOR, Math.random()));
    root.add(sprite);
    puffs.push({
      sprite,
      angleOffset: (index / PUFF_COUNT) * Math.PI * 2 + (Math.random() * 2 - 1) * 0.24,
      radiusFactor: 0.78 + Math.random() * 0.98,
      scaleFactor: 0.84 + Math.random() * 1.12,
      driftSpeed: 0.45 + Math.random() * 0.7,
      spinSpeed: (Math.random() * 2 - 1) * 0.18,
      pulseOffset: Math.random() * Math.PI * 2,
      verticalOffset: (Math.random() * 2 - 1) * 0.26,
    });
  }

  return {
    root,
    shipRadius,
    hazeLayers,
    puffs,
  };
}

export function hideEmergencyVentEffect(effect: PlayerVentEffect): void {
  effect.root.visible = false;
}

export function updateEmergencyVentEffectVisual(
  effect: PlayerVentEffect,
  elapsed: number,
  progress: number,
): void {
  effect.root.visible = true;

  const spread = THREE.MathUtils.smootherstep(progress, 0, 1);
  const ignition = THREE.MathUtils.smootherstep(progress, 0, 0.14);
  const fadeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.72, 1);
  const coreDensity = 1 - THREE.MathUtils.smoothstep(progress, 0.42, 1);
  const intensity = ignition * fadeOut;
  const originRingRadius = effect.shipRadius * VENT_ORIGIN_RING_FRACTION;
  const turbulence = 0.92 + Math.sin(elapsed * 2.6) * 0.035;

  effect.root.scale.setScalar(1 + spread * 0.08);
  effect.root.rotation.y = Math.sin(elapsed * 0.28) * 0.05;

  for (const [index, layer] of effect.hazeLayers.entries()) {
    const pulse = 0.86 + Math.sin(elapsed * layer.driftSpeed + layer.pulseOffset) * 0.14;
    const angle =
      (index / effect.hazeLayers.length) * Math.PI * 2 + layer.pulseOffset * 0.35 + elapsed * 0.045;
    const ringRadius =
      originRingRadius * (0.9 + index * 0.08 + Math.sin(elapsed * 0.16 + layer.pulseOffset) * 0.05);
    const scale =
      effect.shipRadius * (2.9 + spread * (1.95 + index * 0.5)) * layer.scaleFactor * pulse;
    const opacity =
      (0.12 + intensity * 0.19 + coreDensity * 0.06) *
      (index === 0 ? 1 : 0.9 - index * 0.07);
    const material = layer.sprite.material as THREE.SpriteMaterial;

    layer.sprite.position.set(
      Math.cos(angle) * ringRadius,
      effect.shipRadius * 0.05 +
        Math.sin(elapsed * 0.22 + layer.pulseOffset) * effect.shipRadius * 0.05,
      Math.sin(angle) * ringRadius * 0.96,
    );
    layer.sprite.scale.setScalar(scale);
    material.opacity = opacity;
    material.rotation = elapsed * 0.04 + layer.pulseOffset;
    material.color.copy(index === 0 ? BRIGHT_CLOUD_COLOR : MID_CLOUD_COLOR);
  }

  for (const puff of effect.puffs) {
    const pulse = 0.72 + Math.sin(elapsed * puff.driftSpeed + puff.pulseOffset) * 0.28;
    const angle = puff.angleOffset + elapsed * puff.spinSpeed + spread * 0.24;
    const radius =
      originRingRadius +
      effect.shipRadius * (0.24 + spread * 2.05) * puff.radiusFactor * pulse * turbulence;
    const scale = effect.shipRadius * (1.1 + spread * 1.95) * puff.scaleFactor * pulse;
    const opacity =
      intensity *
      (0.085 + 0.11 * pulse + coreDensity * 0.025) *
      (0.92 - Math.abs(puff.verticalOffset) * 0.35);
    const material = puff.sprite.material as THREE.SpriteMaterial;

    puff.sprite.position.set(
      Math.cos(angle) * radius,
      effect.shipRadius * (0.05 + puff.verticalOffset * 0.7) +
        Math.sin(elapsed * 0.42 + puff.pulseOffset) * effect.shipRadius * 0.1,
      Math.sin(angle) * radius * 0.92,
    );
    puff.sprite.scale.setScalar(scale);
    material.opacity = opacity;
    material.rotation = angle * 0.65 + puff.pulseOffset * 0.3;
    material.color.copy(puff.scaleFactor > 1.25 ? MID_CLOUD_COLOR : DIM_CLOUD_COLOR);
  }
}

function createVentSprite(
  texture: THREE.Texture,
  color: THREE.ColorRepresentation,
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 24;
  return sprite;
}

function getEmergencyVentTexture(): THREE.CanvasTexture {
  if (emergencyVentTexture) {
    return emergencyVentTexture;
  }

  const canvas = document.createElement("canvas");
  const size = 192;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D canvas context is unavailable for emergency vent texture generation.");
  }

  const center = size / 2;
  context.clearRect(0, 0, size, size);

  for (let index = 0; index < 72; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.pow(Math.random(), 2) * size * 0.18;
    const radius = size * THREE.MathUtils.lerp(0.11, 0.29, Math.random());
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    const alpha = THREE.MathUtils.lerp(0.065, 0.18, Math.random());
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.42, `rgba(235,242,248,${alpha * 0.7})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  for (let index = 0; index < 14; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * size * 0.07;
    const radius = size * THREE.MathUtils.lerp(0.09, 0.18, Math.random());
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    const alpha = THREE.MathUtils.lerp(0.08, 0.17, Math.random());
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gradient.addColorStop(0.55, `rgba(240,245,250,${alpha * 0.74})`);
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalCompositeOperation = "destination-out";
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * size * 0.18;
    const radius = size * THREE.MathUtils.lerp(0.08, 0.18, Math.random());
    const x = center + Math.cos(angle) * distance;
    const y = center + Math.sin(angle) * distance;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, "rgba(0,0,0,0.18)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  emergencyVentTexture = texture;
  return texture;
}
