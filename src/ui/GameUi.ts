import * as THREE from "three";
import { requireElement } from "../utils";

const DEFAULT_MENU_COPY =
  "Wireframe prototype with mouse steering, inertial thrust, elastic-ish collisions, and persistent high score.";

export interface HudSnapshot {
  score: number;
  lives: number;
  running: boolean;
  invulnerable: boolean;
  highScore: number;
  velocityX: number;
  velocityZ: number;
}

export interface AfterburnerSnapshot {
  charge: number;
  maxCharge: number;
  active: boolean;
  cooling: boolean;
}

export class GameUi {
  root: HTMLDivElement;
  hud: HTMLDivElement;
  crosshair: HTMLDivElement;
  afterburnerGauge: HTMLDivElement;
  afterburnerFill: HTMLDivElement;
  afterburnerLabel: HTMLSpanElement;
  menu: HTMLDivElement;
  menuTitle: HTMLHeadingElement;
  menuCopy: HTMLParagraphElement;
  startButton: HTMLButtonElement;
  quitButton: HTMLButtonElement;
  highScoreLine: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud-root";

    this.hud = document.createElement("div");
    this.hud.className = "hud-bar";
    this.root.append(this.hud);

    this.afterburnerGauge = document.createElement("div");
    this.afterburnerGauge.className = "afterburner-gauge";
    this.afterburnerGauge.innerHTML = `
      <div class="afterburner-label-row">
        <span class="afterburner-name">Afterburner</span>
        <span class="afterburner-value">100%</span>
      </div>
      <div class="afterburner-track">
        <div class="afterburner-fill"></div>
      </div>
    `;
    this.afterburnerFill = requireElement(
      this.afterburnerGauge.querySelector<HTMLDivElement>(".afterburner-fill"),
      "Afterburner fill element not found.",
    );
    this.afterburnerLabel = requireElement(
      this.afterburnerGauge.querySelector<HTMLSpanElement>(".afterburner-value"),
      "Afterburner value element not found.",
    );
    this.root.append(this.afterburnerGauge);

    this.crosshair = document.createElement("div");
    this.crosshair.className = "crosshair";
    this.root.append(this.crosshair);

    this.menu = document.createElement("div");
    this.menu.className = "menu";
    this.menu.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">Bastardoids</h1>
        <p class="menu-copy">${DEFAULT_MENU_COPY}</p>
      </div>
    `;

    const panel = requireElement(this.menu.firstElementChild, "Menu panel not found.");
    this.highScoreLine = document.createElement("div");
    this.highScoreLine.className = "menu-copy";
    panel.append(this.highScoreLine);

    this.startButton = document.createElement("button");
    this.startButton.className = "menu-button";
    this.startButton.type = "button";
    this.startButton.textContent = "Start";
    panel.append(this.startButton);

    this.quitButton = document.createElement("button");
    this.quitButton.className = "menu-button secondary";
    this.quitButton.type = "button";
    this.quitButton.textContent = "Quit";
    panel.append(this.quitButton);

    this.root.append(this.menu);
    container.append(this.root);

    this.menuTitle = requireElement(
      panel.querySelector<HTMLHeadingElement>(".menu-title"),
      "Menu title element not found.",
    );
    this.menuCopy = requireElement(
      panel.querySelector<HTMLParagraphElement>(".menu-copy"),
      "Menu copy element not found.",
    );
  }

  attachRenderer(canvas: HTMLCanvasElement): void {
    canvas.className = "game-canvas";
    this.root.prepend(canvas);
  }

  onStart(handler: () => void): void {
    this.startButton.addEventListener("click", handler);
  }

  onQuit(handler: () => void): void {
    this.quitButton.addEventListener("click", handler);
  }

  setMenuState(buttonLabel: string, highScore: number, copy?: string): void {
    this.menu.hidden = false;
    this.menuTitle.textContent = "Bastardoids";
    this.menuCopy.textContent = copy ?? DEFAULT_MENU_COPY;
    this.startButton.textContent = buttonLabel;
    this.highScoreLine.textContent = `High score: ${highScore}`;
  }

  hideMenu(): void {
    this.menu.hidden = true;
  }

  updateHud(snapshot: HudSnapshot): void {
    const state = snapshot.running
      ? snapshot.invulnerable
        ? "Shielded"
        : "Live"
      : "Menu";

    this.hud.innerHTML = `
      <span>Score ${snapshot.score}</span>
      <span>Lives ${snapshot.lives}</span>
      <span>State ${state}</span>
      <span>High ${snapshot.highScore}</span>
      <span>X vel ${snapshot.velocityX.toFixed(1)}</span>
      <span>Z vel ${snapshot.velocityZ.toFixed(1)}</span>
    `;
  }

  updateAfterburner(snapshot: AfterburnerSnapshot): void {
    const afterburnerPercent = Math.round((snapshot.charge / snapshot.maxCharge) * 100);
    this.afterburnerFill.style.width = `${afterburnerPercent}%`;
    this.afterburnerLabel.textContent = `${afterburnerPercent}%`;
    this.afterburnerGauge.classList.toggle("active", snapshot.active);
    this.afterburnerGauge.classList.toggle("cooling", snapshot.cooling);
  }

  setCrosshairClientPosition(x: number, y: number): void {
    this.crosshair.style.left = `${x}px`;
    this.crosshair.style.top = `${y}px`;
  }

  updateCrosshairPosition(pointerNdc: THREE.Vector2, viewport: THREE.Vector2): void {
    this.crosshair.style.left = `${((pointerNdc.x + 1) * viewport.x) / 2}px`;
    this.crosshair.style.top = `${((1 - pointerNdc.y) * viewport.y) / 2}px`;
  }
}
