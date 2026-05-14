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

function createMissileBodyTexture(): THREE.Texture {
  const width = 256;
  const height = 64;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Texture(canvas);
  }

  const baseGradient = context.createLinearGradient(0, 0, 0, height);
  baseGradient.addColorStop(0, "#f6f8fb");
  baseGradient.addColorStop(0.48, "#d6dce5");
  baseGradient.addColorStop(1, "#8e97a4");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(255, 255, 255, 0.72)";
  context.fillRect(0, 0, width, 10);

  context.fillStyle = "rgba(78, 88, 101, 0.72)";
  context.fillRect(0, height - 10, width, 10);

  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.fillRect(20, 14, 56, 8);
  context.fillRect(20, 42, 56, 8);

  context.fillStyle = "rgba(168, 176, 188, 0.7)";
  context.fillRect(98, 12, 8, 40);
  context.fillRect(170, 12, 8, 40);

  context.strokeStyle = "rgba(54, 61, 70, 0.55)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(86, 8);
  context.lineTo(86, height - 8);
  context.moveTo(162, 8);
  context.lineTo(162, height - 8);
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
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
const missileBodyTexture = createMissileBodyTexture();

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

function createSrmLocustMesh(weapon: WeaponDefinition): THREE.Group {
  const mesh = new THREE.Group();
  const missile = new THREE.Group();
  mesh.add(missile);

  const bodyMaterial = new THREE.MeshBasicMaterial({
    color: 0xf1f5fb,
    map: missileBodyTexture,
  });
  const noseMaterial = new THREE.MeshBasicMaterial({
    color: 0xfafcff,
  });
  const finMaterial = new THREE.MeshBasicMaterial({
    color: 0xc0c9d4,
  });
  const tailMaterial = new THREE.MeshBasicMaterial({
    color: 0x5a6572,
  });
  const flameCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff2b5,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameShellMaterial = new THREE.MeshBasicMaterial({
    color: 0xffa73a,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flameTrailMaterial = new THREE.MeshBasicMaterial({
    color: 0xff6c1f,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd66a,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const bodyRadius = weapon.visualWidth * 0.38;
  const bodyLength = weapon.visualLength * 0.72;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyRadius, bodyRadius * 0.94, bodyLength, 14, 1, false),
    bodyMaterial,
  );
  body.rotation.x = Math.PI / 2;
  body.position.z = -weapon.visualLength * 0.02;
  missile.add(body);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(bodyRadius * 0.92, weapon.visualLength * 0.42, 14),
    noseMaterial,
  );
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = body.position.z + bodyLength * 0.5 + weapon.visualLength * 0.18;
  missile.add(nose);

  const tail = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyRadius * 0.58, bodyRadius * 0.78, weapon.visualLength * 0.26, 12),
    tailMaterial,
  );
  tail.rotation.x = Math.PI / 2;
  tail.position.z = body.position.z - bodyLength * 0.5 - weapon.visualLength * 0.02;
  missile.add(tail);

  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(bodyRadius * 0.24, bodyRadius * 0.32, weapon.visualLength * 0.14, 10),
    new THREE.MeshBasicMaterial({ color: 0x23292f }),
  );
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = tail.position.z - weapon.visualLength * 0.12;
  missile.add(nozzle);

  const finGeometry = new THREE.BoxGeometry(
    weapon.visualWidth * 0.92,
    weapon.visualWidth * 0.08,
    weapon.visualLength * 0.28,
  );
  for (let index = 0; index < 4; index += 1) {
    const fin = new THREE.Mesh(finGeometry, finMaterial);
    fin.position.z = tail.position.z - weapon.visualLength * 0.03;
    fin.rotation.z = (Math.PI * 0.5 * index) + Math.PI * 0.25;
    missile.add(fin);
  }

  const exhaustRoot = new THREE.Group();
  exhaustRoot.position.z = nozzle.position.z - weapon.visualLength * 0.03;
  missile.add(exhaustRoot);
  const flameWidthMultiplier = 1.3;
  const flameLengthMultiplier = 1.5;

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(bodyRadius * 0.42, 12, 10),
    glowMaterial,
  );
  glow.position.z = weapon.visualLength * 0.02;
  exhaustRoot.add(glow);

  const flameShell = new THREE.Mesh(
    new THREE.ConeGeometry(
      bodyRadius * 0.56 * flameWidthMultiplier,
      weapon.visualLength * 0.48 * flameLengthMultiplier,
      12,
    ),
    flameShellMaterial,
  );
  flameShell.rotation.x = Math.PI / 2;
  flameShell.position.z = -weapon.visualLength * 0.27;
  exhaustRoot.add(flameShell);

  const flameCore = new THREE.Mesh(
    new THREE.ConeGeometry(
      bodyRadius * 0.3 * flameWidthMultiplier,
      weapon.visualLength * 0.36 * flameLengthMultiplier,
      10,
    ),
    flameCoreMaterial,
  );
  flameCore.rotation.x = Math.PI / 2;
  flameCore.position.z = -weapon.visualLength * 0.21;
  exhaustRoot.add(flameCore);

  const flameTrail = new THREE.Mesh(
    new THREE.ConeGeometry(
      bodyRadius * 0.24 * flameWidthMultiplier,
      weapon.visualLength * 0.88 * flameLengthMultiplier,
      10,
    ),
    flameTrailMaterial,
  );
  flameTrail.rotation.x = Math.PI / 2;
  flameTrail.position.z = -weapon.visualLength * 0.63;
  exhaustRoot.add(flameTrail);

  const baseGlowScale = glow.scale.clone();
  const baseShellScale = flameShell.scale.clone();
  const baseCoreScale = flameCore.scale.clone();
  const baseTrailScale = flameTrail.scale.clone();
  const spinPhase = Math.random() * Math.PI * 2;
  const pulsePhase = Math.random() * Math.PI * 2;
  const flutterPhase = Math.random() * Math.PI * 2;
  (mesh.userData as WeaponProjectileUserData).update = (_delta, elapsed) => {
    missile.rotation.z = spinPhase + elapsed * 8.5;
    const pulse = 1 + Math.sin(elapsed * 21 + pulsePhase) * 0.14;
    const flutter = Math.sin(elapsed * 33 + flutterPhase);
    const plumeShift = flutter * bodyRadius * 0.08;

    glow.scale.set(
      baseGlowScale.x * (1.08 + pulse * 0.18),
      baseGlowScale.y * (1.08 + pulse * 0.18),
      baseGlowScale.z * (1.08 + pulse * 0.18),
    );
    glow.material.opacity = 0.2 + pulse * 0.09;

    flameShell.position.x = plumeShift;
    flameShell.position.y = -plumeShift * 0.3;
    flameShell.scale.set(
      baseShellScale.x * (0.96 + pulse * 0.18),
      baseShellScale.y * (0.96 + pulse * 0.18),
      baseShellScale.z * (0.84 + pulse * 0.34),
    );
    flameShell.material.opacity = 0.34 + pulse * 0.12;

    flameCore.position.x = plumeShift * 0.55;
    flameCore.position.y = -plumeShift * 0.18;
    flameCore.scale.set(
      baseCoreScale.x * (0.94 + pulse * 0.14),
      baseCoreScale.y * (0.94 + pulse * 0.14),
      baseCoreScale.z * (0.88 + pulse * 0.28),
    );
    flameCore.material.opacity = 0.72 + pulse * 0.14;

    flameTrail.position.x = plumeShift * 1.15;
    flameTrail.position.y = -plumeShift * 0.38;
    flameTrail.scale.set(
      baseTrailScale.x * (0.82 + pulse * 0.18),
      baseTrailScale.y * (0.82 + pulse * 0.18),
      baseTrailScale.z * (0.92 + pulse * 0.46),
    );
    flameTrail.material.opacity = 0.1 + pulse * 0.07;
  };

  return mesh;
}

export function createWeaponProjectileMesh(weapon: WeaponDefinition): THREE.Group {
  if (weapon.visual === "kineticTorpedo") {
    return createKineticTorpedoMesh(weapon);
  }

  if (weapon.visual === "srmLocust") {
    return createSrmLocustMesh(weapon);
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
