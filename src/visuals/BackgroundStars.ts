import * as THREE from "three";
import type { BackgroundStarTile, ReferenceGridBounds, WorldConfig } from "../types";

export class BackgroundStars {
  root = new THREE.Group();
  tiles: BackgroundStarTile[] = [];
  center = new THREE.Vector3();
  tileWidth = 0;
  tileDepth = 0;
  world: WorldConfig;

  constructor(world: WorldConfig) {
    this.world = world;
  }

  refresh(cameraFocus: THREE.Vector3, viewBounds: ReferenceGridBounds, force: boolean): void {
    const desiredWidth = Math.ceil(viewBounds.halfWidth * 2);
    const desiredDepth = Math.ceil(viewBounds.halfDepth * 2);
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
      tile.geometry.dispose();
      tile.material.dispose();
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

  private buildTile(): BackgroundStarTile {
    const starVertices: number[] = [];
    const halfWidth = this.tileWidth / 2;
    const halfDepth = this.tileDepth / 2;
    for (let index = 0; index < this.world.backgroundStarsPerTile; index += 1) {
      starVertices.push(
        (Math.random() * 2 - 1) * halfWidth,
        this.world.backgroundStarHeightMin +
          Math.random() *
            (this.world.backgroundStarHeightMax - this.world.backgroundStarHeightMin),
        (Math.random() * 2 - 1) * halfDepth,
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(starVertices, 3));
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xbad8ff,
        size: this.world.backgroundStarSize,
        sizeAttenuation: true,
      }),
    );
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
