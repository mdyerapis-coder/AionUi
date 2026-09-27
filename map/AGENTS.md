# AionUi — map

A walkable graph of this repo (fork of `iOfficeAI/AionUi`). Coverage is partial: desktop and web-host object cards, plus the launch processes. The UI layer (`packages/desktop/src/renderer`), `mobile/`, and `examples/` are not mapped. There is no `objects/web-cli/` card; the web-cli launch writeup is `processes/launch-web-cli.md`.

## Where things live

| Folder              | What it holds                                                           |
| ------------------- | ----------------------------------------------------------------------- |
| `CONTEXT.md`        | how to walk, universes, the aioncore boundary                           |
| `objects/desktop/`  | the Electron main process — app lifecycle, window, IPC bridge           |
| `objects/web-host/` | spawns/monitors the aioncore backend, serves the SPA                    |
| `processes/`        | launch-desktop (including `--webui`), launch-web-cli, backend-lifecycle |
| `effects/`          | change-impact index                                                     |

## Route by what just happened

| If                                            | Go to                                                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| "what is X"                                   | `objects/_index.md`                                                                      |
| "how does the running service actually start" | `processes/launch-desktop.md` — `aionui.service` runs the Electron binary with `--webui` |
| "what is aioncore"                            | `CONTEXT.md` — it's a bundled binary, not source in this repo                            |
| "what does a change hit"                      | `effects/CONTEXT.md`                                                                     |
