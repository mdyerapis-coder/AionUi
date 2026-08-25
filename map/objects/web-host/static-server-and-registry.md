---
type: object
cluster: web-host
universe: live
status: verified
entity: packages/web-host/src/static-server.ts
---

# startStaticServer / agent-process-registry

The two remaining pieces of the shared `web-host` library: serving the SPA over HTTP, and persisting a record of which agent processes are running.

## Why this shape

`AGENT_PROCESS_REGISTRY_RELATIVE_PATH = path.join('runtime', 'agent-process-registry.json')` (`agent-process-registry.ts:20`) — the registry is a plain JSON file under a `runtime/` dir inside the data directory, not an in-memory-only list. This means "what agents are running" survives an app restart and is inspectable outside the app (ICM-adjacent: state as a file, not hidden in a process).

## Shape

- `startStaticServer(opts: StaticServerOptions): Promise<StaticServerHandle>` (`static-server.ts:120`) / `stopStaticServer(handle)` (`:241`) — serves the built SPA assets.
- `resolveAgentProcessRegistryPath(dataDir: string)` (`agent-process-registry.ts:31`) — resolves the registry file location given a data dir.

Citations: `packages/web-host/src/static-server.ts:18,25,120,241`; `packages/web-host/src/agent-process-registry.ts:20,31`

## Connected to

- **owns:** the HTTP server serving the frontend build; the on-disk agent-process registry file
- **owned-by:** `packages/web-cli/src/index.ts` (imports both `startWebHost` and `startStaticServer` directly) and desktop's `--webui` mode
- **joins:** `objects/web-host/backend-launcher.md` (BackendLifecycleManager likely writes to the registry when it spawns/stops a process — unverified, read both files together before changing either)
- **looks-like-but-is-not:** this is not the renderer build process — it serves already-built static assets, it doesn't build them

## If you change this

- **Hits:** anything depending on knowing which agent processes exist across a restart
- **Does not hit:** the backend spawn logic itself (`backend-launcher.ts`) — registry and launcher are separate files; verify the actual write-coupling before assuming they're synchronized correctly

## Surfaces

| Surface | Role |
|---|---|
| `web-cli` | starts both directly |
| `desktop` `--webui` mode | starts via the same shared functions |

## See

- Source: `packages/web-host/src/static-server.ts`, `packages/web-host/src/agent-process-registry.ts`
