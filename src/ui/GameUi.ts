import * as THREE from "three";
import type { PerformanceSnapshot } from "../PerformanceMonitor";
import { requireElement } from "../utils";

const DEFAULT_MENU_COPY =
  "Wireframe prototype with mouse steering, inertial thrust, elastic-ish collisions, and persistent high score.";

export interface HudSnapshot {
  score: number;
  running: boolean;
  highScore: number;
  velocityX: number;
  velocityZ: number;
  performance: PerformanceSnapshot | null;
}

export interface ShipStatusSnapshot {
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
}

export interface AfterburnerSnapshot {
  charge: number;
  maxCharge: number;
  active: boolean;
  cooling: boolean;
}

export interface HeatSnapshot {
  current: number;
  softCap: number;
  max: number;
}

export interface EnemyTrackerSnapshot {
  enemyId: number;
  screenX: number;
  screenY: number;
  angleDegrees: number;
  distanceUnits: number;
}

export class GameUi {
  root: HTMLDivElement;
  hud: HTMLDivElement;
  heatGauge: HTMLDivElement;
  heatFill: HTMLDivElement;
  heatLabel: HTMLSpanElement;
  heatSoftCapMarker: HTMLDivElement;
  heatSoftCapLabel: HTMLSpanElement;
  heatMaxMarker: HTMLDivElement;
  heatMaxLabel: HTMLSpanElement;
  shipStatus: HTMLDivElement;
  shipShieldFill: HTMLDivElement;
  shipShieldLabel: HTMLSpanElement;
  shipHullFill: HTMLDivElement;
  shipHullLabel: HTMLSpanElement;
  crosshair: HTMLDivElement;
  enemyTrackerLayer: HTMLDivElement;
  afterburnerGauge: HTMLDivElement;
  afterburnerFill: HTMLDivElement;
  afterburnerLabel: HTMLSpanElement;
  menu: HTMLDivElement;
  menuTitle: HTMLHeadingElement;
  menuCopy: HTMLParagraphElement;
  startButton: HTMLButtonElement;
  quitButton: HTMLButtonElement;
  highScoreLine: HTMLDivElement;
  enemyTrackerElements = new Map<number, HTMLDivElement>();

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud-root";

    this.hud = document.createElement("div");
    this.hud.className = "hud-bar";
    this.root.append(this.hud);

    this.heatGauge = document.createElement("div");
    this.heatGauge.className = "heat-gauge";
    this.heatGauge.innerHTML = `
      <div class="heat-label-row">
        <span class="heat-name">Heat</span>
        <span class="heat-value">0 / 0</span>
      </div>
      <div class="heat-track">
        <div class="heat-fill"></div>
        <div class="heat-marker heat-marker-100">
          <span>0</span>
        </div>
        <div class="heat-marker heat-marker-150">
          <span>0</span>
        </div>
      </div>
    `;
    this.heatFill = requireElement(
      this.heatGauge.querySelector<HTMLDivElement>(".heat-fill"),
      "Heat fill element not found.",
    );
    this.heatLabel = requireElement(
      this.heatGauge.querySelector<HTMLSpanElement>(".heat-value"),
      "Heat value element not found.",
    );
    this.heatSoftCapMarker = requireElement(
      this.heatGauge.querySelector<HTMLDivElement>(".heat-marker-100"),
      "Heat soft-cap marker element not found.",
    );
    this.heatSoftCapLabel = requireElement(
      this.heatSoftCapMarker.querySelector<HTMLSpanElement>("span"),
      "Heat soft-cap marker label element not found.",
    );
    this.heatMaxMarker = requireElement(
      this.heatGauge.querySelector<HTMLDivElement>(".heat-marker-150"),
      "Heat max marker element not found.",
    );
    this.heatMaxLabel = requireElement(
      this.heatMaxMarker.querySelector<HTMLSpanElement>("span"),
      "Heat max marker label element not found.",
    );
    this.root.append(this.heatGauge);

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

    this.shipStatus = document.createElement("div");
    this.shipStatus.className = "ship-status";
    this.shipStatus.innerHTML = `
      <div class="ship-status-shield-track">
        <div class="ship-status-shield-fill"></div>
        <span class="ship-status-shield-label">Shield 0 / 0</span>
      </div>
      <div class="ship-status-core">
        <div class="ship-status-hull-shell">
          <div class="ship-status-hull-fill"></div>
          <div class="ship-status-hull-gloss"></div>
          <div class="ship-status-hull-ring"></div>
          <span class="ship-status-hull-label">Hull 0 / 0</span>
        </div>
      </div>
      <div class="ship-status-base"></div>
    `;
    this.shipShieldFill = requireElement(
      this.shipStatus.querySelector<HTMLDivElement>(".ship-status-shield-fill"),
      "Ship shield fill element not found.",
    );
    this.shipShieldLabel = requireElement(
      this.shipStatus.querySelector<HTMLSpanElement>(".ship-status-shield-label"),
      "Ship shield label element not found.",
    );
    this.shipHullFill = requireElement(
      this.shipStatus.querySelector<HTMLDivElement>(".ship-status-hull-fill"),
      "Ship hull fill element not found.",
    );
    this.shipHullLabel = requireElement(
      this.shipStatus.querySelector<HTMLSpanElement>(".ship-status-hull-label"),
      "Ship hull label element not found.",
    );
    this.root.append(this.shipStatus);

    this.crosshair = document.createElement("div");
    this.crosshair.className = "crosshair";
    this.root.append(this.crosshair);

    this.enemyTrackerLayer = document.createElement("div");
    this.enemyTrackerLayer.className = "enemy-tracker-layer";
    this.root.append(this.enemyTrackerLayer);

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

  setGameplayCursorHidden(hidden: boolean): void {
    this.root.classList.toggle("gameplay-cursor-hidden", hidden);
  }

  updateHud(snapshot: HudSnapshot): void {
    const state = snapshot.running ? "Flight" : "Menu";
    this.shipStatus.hidden = !snapshot.running;

    const performanceStats = snapshot.performance
      ? `
      <span>FPS ${snapshot.performance.fps.toFixed(0)}</span>
      <span>Frame ${snapshot.performance.frameMs.toFixed(1)}ms</span>
      <span>Work ${snapshot.performance.workMs.toFixed(1)}ms</span>
    `
      : "";

    this.hud.innerHTML = `
      <span>Score ${snapshot.score}</span>
      <span>Status ${state}</span>
      <span>High ${snapshot.highScore}</span>
      <span>X vel ${snapshot.velocityX.toFixed(1)}</span>
      <span>Z vel ${snapshot.velocityZ.toFixed(1)}</span>
      ${performanceStats}
    `;
  }

  updateShipStatus(snapshot: ShipStatusSnapshot): void {
    const hullPercent = snapshot.maxHull > 0 ? Math.max(0, Math.min(snapshot.hull / snapshot.maxHull, 1)) : 0;
    const shieldPercent =
      snapshot.maxShield > 0 ? Math.max(0, Math.min(snapshot.shield / snapshot.maxShield, 1)) : 0;
    const displayedHull = snapshot.hull > 0 ? Math.ceil(snapshot.hull) : 0;
    const displayedShield = snapshot.shield > 0 ? Math.ceil(snapshot.shield) : 0;

    this.shipHullFill.style.height = `${hullPercent * 100}%`;
    this.shipHullFill.style.background = this.getHullColor(hullPercent);
    this.shipHullLabel.textContent = `Hull ${displayedHull} / ${Math.round(snapshot.maxHull)}`;

    this.shipShieldFill.style.transform = `scaleX(${shieldPercent})`;
    this.shipShieldLabel.textContent = `Shield ${displayedShield} / ${Math.round(snapshot.maxShield)}`;
    this.shipStatus.classList.toggle("shield-empty", snapshot.maxShield <= 0 || shieldPercent <= 0.001);
  }

  updateAfterburner(snapshot: AfterburnerSnapshot): void {
    const afterburnerPercent = Math.round((snapshot.charge / snapshot.maxCharge) * 100);
    this.afterburnerFill.style.width = `${afterburnerPercent}%`;
    this.afterburnerLabel.textContent = `${afterburnerPercent}%`;
    this.afterburnerGauge.classList.toggle("active", snapshot.active);
    this.afterburnerGauge.classList.toggle("cooling", snapshot.cooling);
  }

  updateHeat(snapshot: HeatSnapshot): void {
    const clampedCurrent = Math.max(0, Math.min(snapshot.current, snapshot.max));
    const percent = snapshot.max > 0 ? (clampedCurrent / snapshot.max) * 100 : 0;
    const softCapPercent = snapshot.max > 0 ? (snapshot.softCap / snapshot.max) * 100 : 0;
    this.heatFill.style.width = `${percent}%`;
    this.heatFill.style.background = this.getHeatColor(clampedCurrent, snapshot.max);
    this.heatLabel.textContent = `${Math.round(clampedCurrent)} / ${snapshot.max}`;
    this.heatSoftCapMarker.style.left = `${softCapPercent}%`;
    this.heatSoftCapLabel.textContent = `${snapshot.softCap}`;
    this.heatMaxMarker.style.left = "100%";
    this.heatMaxLabel.textContent = `${snapshot.max}`;
  }

  setCrosshairClientPosition(x: number, y: number): void {
    this.crosshair.style.left = `${x}px`;
    this.crosshair.style.top = `${y}px`;
  }

  updateCrosshairPosition(pointerNdc: THREE.Vector2, viewport: THREE.Vector2): void {
    this.crosshair.style.left = `${((pointerNdc.x + 1) * viewport.x) / 2}px`;
    this.crosshair.style.top = `${((1 - pointerNdc.y) * viewport.y) / 2}px`;
  }

  updateEnemyTrackers(trackers: EnemyTrackerSnapshot[]): void {
    const activeIds = new Set<number>();

    for (const tracker of trackers) {
      activeIds.add(tracker.enemyId);
      let element = this.enemyTrackerElements.get(tracker.enemyId);
      if (!element) {
        element = document.createElement("div");
        element.className = "enemy-tracker";
        element.innerHTML = `
          <div class="enemy-tracker-chevron">
            <span></span>
            <span></span>
          </div>
          <span class="enemy-tracker-distance">0 U</span>
        `;
        this.enemyTrackerElements.set(tracker.enemyId, element);
        this.enemyTrackerLayer.append(element);
      }

      const chevron = requireElement(
        element.querySelector<HTMLDivElement>(".enemy-tracker-chevron"),
        "Enemy tracker chevron element not found.",
      );
      const distanceLabel = requireElement(
        element.querySelector<HTMLSpanElement>(".enemy-tracker-distance"),
        "Enemy tracker distance element not found.",
      );

      element.style.left = `${tracker.screenX}px`;
      element.style.top = `${tracker.screenY}px`;
      chevron.style.transform = `rotate(${tracker.angleDegrees}deg)`;
      distanceLabel.textContent = `${Math.max(0, Math.round(tracker.distanceUnits))} U`;
    }

    for (const [enemyId, element] of this.enemyTrackerElements) {
      if (activeIds.has(enemyId)) {
        continue;
      }

      element.remove();
      this.enemyTrackerElements.delete(enemyId);
    }
  }

  private getHeatColor(current: number, max: number): string {
    if (max <= 0) {
      return "#3dff79";
    }

    if (current <= 100) {
      const normalized = Math.max(0, Math.min(current / 100, 1));
      const hue = 120 - normalized * 90;
      return `hsl(${hue.toFixed(0)} 95% 58%)`;
    }

    return "#ff4a36";
  }

  private getHullColor(percent: number): string {
    if (percent > 0.66) {
      return "linear-gradient(180deg, #ff8870, #ff4f39 55%, #d31812)";
    }
    if (percent > 0.33) {
      return "linear-gradient(180deg, #ffb062, #ff6938 55%, #cf2714)";
    }

    return "linear-gradient(180deg, #ffcf7b, #ff5c31 45%, #b30b0b)";
  }
}
