# AionUi — map

A walkable graph of this repo. This is a large, actively-developed fork of the popular open-source `iOfficeAI/AionUi` project (this fork: `mdyerapis-coder/AionUi`) — coverage here is intentionally partial: the three packages that make up the actually-running service (`desktop`, `web-host`, `web-cli`) are mapped; the UI layer (`packages/desktop/src/renderer`), `mobile/`, and the `examples/` extension SDK are not.

## Where things live

| Folder | What it holds |
|---|---|
| `CONTEXT.md` | how to walk, universes, the aioncore boundary |
| `objects/desktop/` | the Electron main process — app lifecycle, window, IPC bridge |
| `objects/web-host/` | the reusable library both desktop and web-cli build on: spawns/monitors the aioncore backend, serves the SPA |
| `objects/web-cli/` | the *alternate* standalone `aionui-web` CLI binary — reuses `web-host` but skips Electron entirely. Not what's running on masons-ground. |
| `processes/` | launch-desktop (incl. `--webui` mode — this is what masons-ground runs), launch-web-cli, backend-lifecycle |
| `effects/` | change-impact index |

## Route by what just happened

| If | Go to |
|---|---|
| "what is X" | `objects/_index.md` |
| "how does the running service actually start" | `processes/launch-desktop.md` — `aionui.service` runs the Electron binary with `--webui`, **not** the separate `web-cli` package |
| "what is aioncore" | `CONTEXT.md` — it's a bundled binary, not source in this repo |
| "what does a change hit" | `effects/CONTEXT.md` |
