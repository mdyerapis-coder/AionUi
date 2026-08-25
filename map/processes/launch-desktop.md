---
type: process
status: verified
consumes: [objects/desktop/main-process.md]
produces: [objects/web-host/backend-launcher.md]
---

# launch-desktop (including --webui mode)

Electron app boot, in either windowed or headless-servable mode. **This is what `aionui.service` on masons-ground runs.**

## Input → Movement → Output

Input: process launch, optionally with `--webui`. Movement: `index.ts` runs Chromium/Sentry setup in a fixed order (`:8-17`), checks `isWebUIMode = hasSwitch('webui')` (`:182`), then calls `startBackendOrExit` to spawn the aioncore backend via `BackendLifecycleManager` before opening a window (or, in `--webui` mode, before serving instead of opening one). Output: either a `BrowserWindow`, or (in `--webui` mode) a running backend + static server with no window — the mode masons-ground uses under `xvfb-run` (a window is still technically created/required by Electron internals even though nothing displays it).

## Why this shape

Startup-order bugs in Electron are silent and hard to reproduce after the fact — see the object card for why `configureChromium` must run first.

## Steps

1. `configureChromium`, Sentry init, `configureConsoleLog` — fixed order (`index.ts:8-17`).
2. `isWebUIMode = hasSwitch('webui')` (`:182`).
3. `startBackendOrExit` → `BackendLifecycleManager` spawns `aioncore` (see `backend-lifecycle` process).
4. Window opens (windowed mode) or is suppressed/headless-served (`--webui`).
5. `installQuitCleanup` wires shutdown.

## If you change this

- **Hits:** the live masons-ground deployment directly — this is its actual startup path
- **Does not hit:** `web-cli`'s startup (`launch-web-cli.md`) — separate entry point, same shared backend logic underneath

## Surfaces

| Surface | Role |
|---|---|
| `aionui.service` | runs this with `--webui` |
| desktop app users | run this without the flag |

## See

- Objects: [../objects/desktop/main-process.md](../objects/desktop/main-process.md)
- Source: `packages/desktop/src/index.ts`
