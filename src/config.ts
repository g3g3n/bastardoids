import gameConfig from "./gameConfig.json";
import type { GameConfig } from "./types";

export function loadGameConfig(): GameConfig {
  return gameConfig as GameConfig;
}
