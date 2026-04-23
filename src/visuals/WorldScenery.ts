import * as THREE from "three";

export class WorldScenery {
  root = new THREE.Group();

  constructor() {
    this.addPlanet();
  }

  private addPlanet(): void {
    const geometry = new THREE.SphereGeometry(220, 48, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0x244f88,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
    });
    const planet = new THREE.Mesh(geometry, material);
    planet.position.set(0, -320, 1500);
    this.root.add(planet);
  }
}
