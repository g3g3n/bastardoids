import * as THREE from "three";
import type { PlayerConfig, PlayerLines, PlayerShield, PlayerState } from "../types";
import { createShipVisual } from "../visuals/createShipVisual";

export interface CreatedPlayer {
  player: PlayerState;
  playerLines: PlayerLines;
  playerShield: PlayerShield;
}

export function createPlayer(playerConfig: PlayerConfig, nextId: number): CreatedPlayer {
  const createdVisual = createShipVisual(playerConfig.shipModel, playerConfig.visualScale, 0xffffff);
  const group = createdVisual.group;
  const lines = createdVisual.lines;

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
    faction: "player",
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
