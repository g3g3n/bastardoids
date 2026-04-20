# Prototype Files

## Files created

- `package.json`  
  Project manifest with Vite, TypeScript, and Three.js dependencies plus `dev`, `build`, and `preview` scripts.

- `tsconfig.json`  
  TypeScript compiler settings, including JSON module support so gameplay settings can live outside the code.

- `vite.config.ts`  
  Minimal Vite dev-server config.

- `index.html`  
  Browser entry page that loads the stylesheet and mounts the Vite-powered Bastardoids browser app through `src/main.ts`.

- `src/gameConfig.json`  
  Central gameplay and tuning config for player stats, laser behavior, asteroid stats, camera settings, spawn progression, and collision response.

- `src/styles.css`  
  UI styling for the canvas, HUD, crosshair, and start/game-over menu.

- `src/main.ts`  
  Main runnable prototype implementation for the browser, now in TypeScript: rendering, input, menu flow, high score persistence, spawning, motion, shooting, collisions, asteroid splitting, invulnerability, and camera behavior.

- `serve-local.ps1`  
  Small PowerShell helper that starts the Vite dev server and opens the prototype in the browser.
