---
type: object
cluster: desktop
universe: live
status: verified
entity: packages/desktop/src/index.ts
---

# Electron main process (index.ts)

The app's single entry point (1119 lines) — boots Electron, decides windowed vs. `--webui` mode, starts the backend, wires IPC.

## Why this shape

Startup order is load-bearing and commented as such: `configureChromium` (sets app name / Chromium flags) must run *before* any call to `app.getPath('userData')`, because Electron caches that path on first call (`index.ts:8-9`). Sentry init (`initSentry()`, `:12`) runs before `configureConsoleLog` so early crashes are still captured. This file reads like a checklist because startup-order bugs in Electron are otherwise silent and hard to reproduce.

## Shape

- `isWebUIMode = hasSwitch('webui')` (`:182`) — the flag that makes this binary run headless-servable instead of opening a window. This is the mode `aionui.service` uses.
- Imports `startBackendOrExit` from `./process/startup/backendStartup` — backend spawning is delegated, not inline (see `BackendLifecycleManager` in the web-host card).
- `assertStartupArchitectureCompatible`, `classifyBackendStartupFailure`, `shouldRegisterBackendStartup`, `installQuitCleanup` — each a distinct startup-safety concern, each its own file under `process/startup/` (stubs in the index).

Citations: `packages/desktop/src/index.ts:8-9,12,17,182`

## Connected to

- **owns:** the Electron `BrowserWindow`, IPC bridge (`ipcBridge`, `./common`)
- **owned-by:** the OS process launched by `aionui.service` (`WorkingDirectory=/home/ubuntu/aionui`, `ExecStart=start.sh` — the deployed build, not this source tree directly; see root map `CONTEXT.md` on the three-copies situation noted in the Projects catalog)
- **joins:** `packages/web-host` (backend lifecycle), `packages/desktop/src/common/adapter/main` (`initMainAdapterWithWindow`)
- **looks-like-but-is-not:** `packages/web-cli` — a *different* entry point into the same backend-spawning logic, not code this file calls

## If you change this

- **Hits:** every launch mode (windowed, `--webui`, `--resetpass` per `ensureAdminUser.ts` comment) — this file is the one place all of them pass through
- **Does not hit:** the renderer UI itself (out of scope for this map) or the aioncore backend's own behavior (separate binary, see root `CONTEXT.md`)

## Surfaces

| Surface | Role |
|---|---|
| `aionui.service` (masons-ground) | runs this in `--webui` mode |
| desktop users (macOS/Windows/Linux installs) | run this in windowed mode |

## See

- Source: `packages/desktop/src/index.ts`
- Process: [../../processes/launch-desktop.md](../../processes/launch-desktop.md)
