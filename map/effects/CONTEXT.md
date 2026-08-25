# Change-impact index

| Changing | Open |
|---|---|
| how the app boots (any mode) | `objects/desktop/main-process.md`, `processes/launch-desktop.md` |
| backend spawn args/env/port logic | `objects/web-host/backend-launcher.md`, `processes/backend-lifecycle.md` — hits both desktop and web-cli |
| static asset serving | `objects/web-host/static-server-and-registry.md` |
| the aioncore binary itself | out of scope — it's a separate project, not source here (see root `CONTEXT.md`) |
| the deployed live instance on masons-ground | it runs from `~/aionui/` (built release artifacts), not this source tree directly — confirm which release build corresponds to a source change before assuming it's live |
| renderer/UI | not mapped in this pass — read `packages/desktop/src/renderer/` directly |
