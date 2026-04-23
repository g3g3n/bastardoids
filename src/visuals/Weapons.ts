import * as THREE from "three";
import type { WeaponDefinition } from "../types";

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

export function createWeaponProjectileMesh(weapon: WeaponDefinition): THREE.Group {
  if (weapon.visual === "kineticTorpedo") {
    return createKineticTorpedoMesh(weapon);
  }

  if (weapon.visual === "plasmaOrb") {
    return createPlasmaOrbMesh(weapon);
  }

  return createLaserBoltMesh(weapon);
}
