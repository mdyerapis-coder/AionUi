---
type: object
cluster: web-host
universe: live
status: verified
entity: packages/web-host/src/backend-launcher.ts
---

# BackendLifecycleManager

Spawns, monitors, and tears down the `aioncore` child process — the boundary between this repo and the actual agent engine binary.

## Why this shape

`aioncore` is a separate compiled binary (see root `CONTEXT.md`), so everything about talking to it is process-management, not a function call: build the right argv (`buildSpawnArgs`, `:196`), build the right environment (`buildSpawnEnv`, `:224`), find a free port for it to bind (`findAvailablePort`, `:267`), then supervise the child process's lifecycle (`BackendLifecycleManager`, `:508`, in a 1089-line file — this is the largest single concern in `web-host`). Two dedicated error types (`BackendStartupError` `:177`, `BackendStartupCancelledError` `:189`) distinguish "it failed to start" from "we gave up waiting/user cancelled" — callers need to handle those differently (retry vs. just exit).

## Shape

- `buildSpawnArgs(config: SpawnConfig)` (`:196`) — argv construction.
- `buildSpawnEnv(dirs: BackendDirConfig)` (`:224`) — environment construction, likely including data-dir paths (matches the observed live process's `--data-dir /home/ubuntu/.config/AionUi/aionui`).
- `findAvailablePort(...)` (`:267`) — port `0` in the live process args suggests OS-assigned ports are also in play; this function likely handles the caller-specified-port path.
- `BackendLifecycleManager` (`:508`) — the actual start/monitor/stop state machine.

Citations: `packages/web-host/src/backend-launcher.ts:177,189,196,224,267,508`

## Connected to

- **owns:** the aioncore child process's lifecycle (not its behavior)
- **owned-by:** `packages/desktop/src/index.ts` (via `startBackendOrExit`) and `packages/web-cli/src/index.ts` (both entry points delegate here)
- **joins:** `resources/bundled-aioncore/<plat-arch>/aioncore` (the binary itself), `packages/web-host/src/agent-process-registry.ts` (tracks what got spawned)
- **looks-like-but-is-not:** this is not the aioncore backend's own health/API logic — it only knows "did the process start, is it alive, how do I stop it"

## If you change this

- **Hits:** both desktop (`--webui` and windowed) and `web-cli` — this is the one shared backend-spawning path
- **Does not hit:** the renderer/UI — it never talks to this directly, only through IPC to the main process

## Surfaces

| Surface | Role |
|---|---|
| `packages/desktop/src/index.ts` | calls via `startBackendOrExit` |
| `packages/web-cli/src/index.ts` | calls via `startWebHost` (re-exported, see `web-host/src/index.ts`) |

## See

- Source: `packages/web-host/src/backend-launcher.ts`
- Process: [../../processes/backend-lifecycle.md](../../processes/backend-lifecycle.md)
