import type { GameConfig } from "./types";

export async function loadGameConfig(): Promise<GameConfig> {
  const configUrl = new URL("./gameConfig.json", import.meta.url);
  configUrl.searchParams.set("v", Date.now().toString());
  const configResponse = await fetch(configUrl, { cache: "no-store" });
  if (!configResponse.ok) {
    throw new Error(`Failed to load game config: ${configResponse.status}`);
  }

  return (await configResponse.json()) as GameConfig;
}
