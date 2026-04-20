import * as THREE from "three";
import type { ReferenceGridBounds, ReferenceGridTile, WorldConfig } from "../types";

export class ReferenceGrid {
  root = new THREE.Group();
  tiles: ReferenceGridTile[] = [];
  center = new THREE.Vector3();
  tileWidth = 0;
  tileDepth = 0;
  world: WorldConfig;

  constructor(world: WorldConfig) {
    this.world = world;
    this.root.position.y = -0.2;
  }

  refresh(cameraFocus: THREE.Vector3, viewBounds: ReferenceGridBounds, force: boolean): void {
    const cellSize = this.world.gridCellSize;
    const desiredWidth = Math.ceil((viewBounds.halfWidth * 2) / cellSize) * cellSize;
    const desiredDepth = Math.ceil((viewBounds.halfDepth * 2) / cellSize) * cellSize;
    const sizeChanged =
      Math.abs(desiredWidth - this.tileWidth) > 0.001 ||
      Math.abs(desiredDepth - this.tileDepth) > 0.001;

    if (force || sizeChanged || this.tiles.length === 0) {
      this.tileWidth = desiredWidth;
      this.tileDepth = desiredDepth;
      this.rebuild();
    }

    this.position(cameraFocus);
  }

  private rebuild(): void {
    for (const tile of this.tiles) {
      tile.traverse((child: THREE.Object3D) => {
        const disposableChild = child as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };

        if (disposableChild.geometry) {
          disposableChild.geometry.dispose();
        }
        if (Array.isArray(disposableChild.material)) {
          for (const material of disposableChild.material) {
            material.dispose();
          }
        } else {
          disposableChild.material?.dispose();
        }
      });
    }

    this.root.clear();
    this.tiles = [];

    for (let zIndex = -1; zIndex <= 1; zIndex += 1) {
      for (let xIndex = -1; xIndex <= 1; xIndex += 1) {
        const tile = this.buildTile();
        tile.userData.offsetX = xIndex;
        tile.userData.offsetZ = zIndex;
        this.tiles.push(tile);
        this.root.add(tile);
      }
    }
  }

  private buildTile(): ReferenceGridTile {
    const group = new THREE.Group();
    const minorVertices: number[] = [];
    const majorVertices: number[] = [];
    const halfWidth = this.tileWidth / 2;
    const halfDepth = this.tileDepth / 2;
    const cellSize = this.world.gridCellSize;
    const majorEvery = this.world.gridMajorEvery;
    const epsilon = 0.0001;
    let columnIndex = 0;

    for (let x = -halfWidth; x <= halfWidth + epsilon; x += cellSize) {
      const target = columnIndex % majorEvery === 0 ? majorVertices : minorVertices;
      target.push(x, 0, -halfDepth, x, 0, halfDepth);
      columnIndex += 1;
    }

    let rowIndex = 0;
    for (let z = -halfDepth; z <= halfDepth + epsilon; z += cellSize) {
      const target = rowIndex % majorEvery === 0 ? majorVertices : minorVertices;
      target.push(-halfWidth, 0, z, halfWidth, 0, z);
      rowIndex += 1;
    }

    if (minorVertices.length > 0) {
      const minorGeometry = new THREE.BufferGeometry();
      minorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(minorVertices, 3));
      group.add(
        new THREE.LineSegments(
          minorGeometry,
          new THREE.LineBasicMaterial({
            color: 0x17304d,
            transparent: true,
            opacity: 0.55,
          }),
        ),
      );
    }

    if (majorVertices.length > 0) {
      const majorGeometry = new THREE.BufferGeometry();
      majorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(majorVertices, 3));
      group.add(
        new THREE.LineSegments(
          majorGeometry,
          new THREE.LineBasicMaterial({
            color: 0x3f6fa6,
            transparent: true,
            opacity: 0.95,
          }),
        ),
      );
    }

    return group;
  }

  private position(cameraFocus: THREE.Vector3): void {
    if (this.tileWidth <= 0 || this.tileDepth <= 0) {
      return;
    }

    this.center.set(
      Math.round(cameraFocus.x / this.tileWidth) * this.tileWidth,
      0,
      Math.round(cameraFocus.z / this.tileDepth) * this.tileDepth,
    );

    for (const tile of this.tiles) {
      tile.position.set(
        this.center.x + tile.userData.offsetX * this.tileWidth,
        0,
        this.center.z + tile.userData.offsetZ * this.tileDepth,
      );
    }
  }
}
