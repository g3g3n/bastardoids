import * as THREE from "three";
import type { PlayerConfig, PlayerLines, PlayerShield, PlayerState } from "../types";

export interface CreatedPlayer {
  player: PlayerState;
  playerLines: PlayerLines;
  playerShield: PlayerShield;
}

export function createPlayer(playerConfig: PlayerConfig, nextId: number): CreatedPlayer {
  const group = new THREE.Group();
  const shipModel = new THREE.Group();
  const shipPoints = [
    new THREE.Vector3(0, 0, 3.4),
    new THREE.Vector3(-1.9, 0, -2.3),
    new THREE.Vector3(1.9, 0, -2.3),
    new THREE.Vector3(0, 1.4, -0.7),
  ];
  const edges: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ];

  const vertices: number[] = [];
  for (const [from, to] of edges) {
    vertices.push(...shipPoints[from].toArray(), ...shipPoints[to].toArray());
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({ color: 0xffffff });
  const lines = new THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>(
    geometry,
    material,
  );
  shipModel.scale.setScalar(playerConfig.visualScale ?? 1);
  shipModel.add(lines);
  group.add(shipModel);

  const shieldGeometry = new THREE.SphereGeometry(playerConfig.radius * 2.15, 14, 12);
  const shieldMaterial = new THREE.MeshBasicMaterial({
    color: 0x69d8ff,
    transparent: true,
    opacity: 0.18,
    wireframe: true,
    depthWrite: false,
  });
  const shield = new THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>(
    shieldGeometry,
    shieldMaterial,
  );
  shield.visible = false;
  group.add(shield);

  const player: PlayerState = {
    id: nextId,
    type: "player",
    mass: playerConfig.mass,
    radius: playerConfig.radius,
    mesh: group,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    yawVelocity: 0,
    invulnerableUntil: 0,
    alive: true,
  };

  return {
    player,
    playerLines: lines,
    playerShield: shield,
  };
}
