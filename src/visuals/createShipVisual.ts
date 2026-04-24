import * as THREE from "three";
import type { ShipLines, ShipModelName } from "../types";
import { SHIP_MODELS } from "./shipModels";

export interface CreatedShipVisual {
  group: THREE.Group;
  lines: ShipLines;
}

export function createShipVisual(
  modelName: ShipModelName,
  visualScale: number,
  color = 0xffffff,
): CreatedShipVisual {
  const group = new THREE.Group();
  const shipModel = new THREE.Group();
  const selectedModel = SHIP_MODELS[modelName] ?? SHIP_MODELS.ship1;
  const vertices: number[] = [];

  for (const [from, to] of selectedModel.segments) {
    vertices.push(...from, ...to);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({ color });
  const lines = new THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>(
    geometry,
    material,
  );

  shipModel.scale.setScalar(visualScale || 1);
  shipModel.add(lines);
  group.add(shipModel);

  return { group, lines };
}
