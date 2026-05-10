import * as THREE from "three";
import type { WeaponDefinition } from "../types";

interface WeaponProjectileUserData {
  update?: (delta: number, elapsed: number) => void;
}

function createPlasmaSpriteTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Texture(canvas);
  }

  const center = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.28, "rgba(188, 236, 255, 0.9)");
  gradient.addColorStop(0.62, "rgba(90, 186, 255, 0.34)");
  gradient.addColorStop(1, "rgba(90, 186, 255, 0)");

  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPlasmaSpriteMaterial(
  map: THREE.Texture,
  color: THREE.ColorRepresentation,
  opacity: number,
): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function createOrbSprite(
  material: THREE.SpriteMaterial,
  width: number,
  height: number = width,
): THREE.Sprite {
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, height, 1);
  return sprite;
}

const plasmaSpriteTexture = createPlasmaSpriteTexture();
const lightPlasmaCannonCoreMaterial = createPlasmaSpriteMaterial(
  plasmaSpriteTexture,
  0xe8fbff,
  0.96,
);
const lightPlasmaCannonAuraMaterial = createPlasmaSpriteMaterial(
  plasmaSpriteTexture,
  0x4ebfff,
  0.42,
);
const lightPlasmaCannonHaloMaterial = createPlasmaSpriteMaterial(
  plasmaSpriteTexture,
  0x2297ff,
  0.2,
);
const lightPlasmaCannonOrbiterCoreMaterial = createPlasmaSpriteMaterial(
  plasmaSpriteTexture,
  0xcaf6ff,
  0.98,
);
const lightPlasmaCannonOrbiterAuraMaterial = createPlasmaSpriteMaterial(
  plasmaSpriteTexture,
  0x63d6ff,
  0.58,
);

function createLaserBoltMesh(weapon: WeaponDefinition): THREE.Group {
  const mesh = new THREE.Group();
  const geometry = new THREE.CylinderGeometry(
    weapon.visualWidth / 2,
    weapon.visualWidth / 2,
    weapon.visualLength,
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
  return mesh;
}

function createKineticTorpedoMesh(weapon: WeaponDefinition): THREE.Group {
  const mesh = new THREE.Group();

  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x49b6ff,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xb8e9ff,
    transparent: true,
    opacity: 0.98,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tailMaterial = new THREE.MeshBasicMaterial({
    color: 0x177dff,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(weapon.visualWidth * 0.72, 18, 12),
    glowMaterial,
  );
  outer.scale.set(1, 1, 1.5);
  mesh.add(outer);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(weapon.visualWidth * 0.38, 16, 12),
    coreMaterial,
  );
  core.scale.set(1, 1, 1.85);
  mesh.add(core);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(weapon.visualWidth * 0.25, weapon.visualLength * 0.42, 12),
    coreMaterial,
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = weapon.visualLength * 0.46;
  mesh.add(nose);

  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(
      weapon.visualWidth * 0.1,
      weapon.visualWidth * 0.22,
      weapon.visualLength * 0.8,
      10,
    ),
    tailMaterial,
  );
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -weapon.visualLength * 0.34;
  mesh.add(tail);

  const finGeometry = new THREE.BufferGeometry();
  finGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        0,
        0,
        0.1,
        0,
        weapon.visualWidth * 0.55,
        -weapon.visualLength * 0.48,
        0,
        0,
        0.1,
        0,
        -weapon.visualWidth * 0.55,
        -weapon.visualLength * 0.48,
        weapon.visualWidth * 0.55,
        0,
        -weapon.visualLength * 0.44,
        -weapon.visualWidth * 0.55,
        0,
        -weapon.visualLength * 0.44,
      ],
      3,
    ),
  );
  const fins = new THREE.LineSegments(
    finGeometry,
    new THREE.LineBasicMaterial({
      color: 0x7bd0ff,
      transparent: true,
      opacity: 0.85,
    }),
  );
  mesh.add(fins);

  return mesh;
}

function createPlasmaOrbMesh(weapon: WeaponDefinition): THREE.Group {
  const mesh = new THREE.Group();

  const auraMaterial = new THREE.MeshBasicMaterial({
    color: 0x2cb7ff,
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x62deff,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0x82ebff,
    transparent: true,
    opacity: 0.56,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xdffaff,
    transparent: true,
    opacity: 0.96,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(weapon.visualWidth * 0.74, 24, 18),
    auraMaterial,
  );
  mesh.add(aura);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(weapon.visualWidth * 0.52, 22, 16),
    glowMaterial,
  );
  mesh.add(glow);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(weapon.visualWidth * 0.34, 20, 14),
    shellMaterial,
  );
  mesh.add(shell);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(weapon.visualWidth * 0.16, 18, 12),
    coreMaterial,
  );
  mesh.add(core);

  return mesh;
}

function createLightPlasmaCannonMesh(weapon: WeaponDefinition): THREE.Group {
  const mesh = new THREE.Group();
  const halo = createOrbSprite(lightPlasmaCannonHaloMaterial, weapon.visualWidth * 2.75);
  const aura = createOrbSprite(lightPlasmaCannonAuraMaterial, weapon.visualWidth * 2.1);
  const core = createOrbSprite(lightPlasmaCannonCoreMaterial, weapon.visualWidth * 1.28);
  mesh.add(halo);
  mesh.add(aura);
  mesh.add(core);

  const orbitGroup = new THREE.Group();
  const orbitRadius = 3;
  const orbiterScale = weapon.visualWidth * 0.82;

  for (const direction of [-1, 1] as const) {
    const orbiter = new THREE.Group();
    orbiter.position.x = orbitRadius * direction;
    orbiter.add(createOrbSprite(lightPlasmaCannonOrbiterAuraMaterial, orbiterScale));
    orbiter.add(createOrbSprite(lightPlasmaCannonOrbiterCoreMaterial, orbiterScale * 0.48));
    orbitGroup.add(orbiter);
  }

  mesh.add(orbitGroup);

  const baseHaloScale = halo.scale.x;
  const baseAuraScale = aura.scale.x;
  const baseCoreScale = core.scale.x;
  const orbitPhase = Math.random() * Math.PI * 2;
  const pulseOffset = Math.random() * Math.PI * 2;
  const orbitSpeed = THREE.MathUtils.randFloat(7.2, 8.8);

  (mesh.userData as WeaponProjectileUserData).update = (_delta, elapsed) => {
    orbitGroup.rotation.z = orbitPhase + elapsed * orbitSpeed;

    const pulse = Math.sin(elapsed * 11 + pulseOffset);
    halo.scale.setScalar(baseHaloScale * (1 + pulse * 0.08));
    aura.scale.setScalar(baseAuraScale * (1 + pulse * 0.06));
    core.scale.setScalar(baseCoreScale * (1 + pulse * 0.04));
  };

  return mesh;
}

export function createWeaponProjectileMesh(weapon: WeaponDefinition): THREE.Group {
  if (weapon.visual === "kineticTorpedo") {
    return createKineticTorpedoMesh(weapon);
  }

  if (weapon.visual === "lightPlasmaCannon") {
    return createLightPlasmaCannonMesh(weapon);
  }

  if (weapon.visual === "plasmaOrb") {
    return createPlasmaOrbMesh(weapon);
  }

  return createLaserBoltMesh(weapon);
}

export function updateWeaponProjectileMesh(
  mesh: THREE.Group,
  delta: number,
  elapsed: number,
): void {
  (mesh.userData as WeaponProjectileUserData).update?.(delta, elapsed);
}
