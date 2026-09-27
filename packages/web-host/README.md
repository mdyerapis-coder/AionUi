# @aionui/web-host

Zero-Electron library that starts the WebUI host. Entry: `src/index.ts` (`startWebHost`).

- `backend-launcher.ts` — spawn and monitor the external `aioncore` binary (`BackendLifecycleManager`, `startBackend` / `stopBackend`).
- `static-server.ts` — serve the renderer SPA and reverse-proxy `/api`, `/login`, `/logout`, and WebSocket upgrades to aioncore. Auth is the backend's `aionui-auth` crate; this package does not store passwords or sessions.
- `agent-process-registry.ts` — registry file path and cleanup of registered agent processes.

Desktop `--webui` calls `startWebHost` from `packages/desktop/src/index.ts` with `backend.kind: 'useExistingBackend'`. Options: `src/types.ts`.
