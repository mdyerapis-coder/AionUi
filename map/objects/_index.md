# Object index

## desktop

| Noun                                                                                                                                                   | Status              | Source                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | --------------------------------------- |
| main process entry (`isWebUIMode`, app boot)                                                                                                           | verified            | `packages/desktop/src/index.ts`         |
| process/startup/\* (backendStartup, singleInstanceGating, architectureCompatibility, quitCleanup, recoverCorruptedDatabase, backendInstallDiagnostics) | stub                | `packages/desktop/src/process/startup/` |
| process/bridge, process/services, process/pet, process/feedback, process/resources                                                                     | stub                | `packages/desktop/src/process/`         |
| renderer (the actual UI)                                                                                                                               | stub — out of scope | `packages/desktop/src/renderer/`        |

## web-host

| Noun                                                                      | Status   | Source                                            |
| ------------------------------------------------------------------------- | -------- | ------------------------------------------------- |
| BackendLifecycleManager, buildSpawnArgs, buildSpawnEnv, findAvailablePort | verified | `packages/web-host/src/backend-launcher.ts`       |
| startStaticServer / stopStaticServer                                      | verified | `packages/web-host/src/static-server.ts`          |
| agent-process-registry                                                    | verified | `packages/web-host/src/agent-process-registry.ts` |

## web-cli

| Noun                                              | Status | Source                                               |
| ------------------------------------------------- | ------ | ---------------------------------------------------- |
| aionui-web entry (composes web-host, no Electron) | stub   | `packages/web-cli/src/index.ts`, `bin/aionui-web.js` |
| ensureAdminPassword, browser (auto-open)          | stub   | `packages/web-cli/src/`                              |

## Not mapped (explicitly out of scope)

`packages/desktop/src/renderer/` (UI), `examples/*` (extension SDK samples), `packages/shared-scripts/` (build-time only)
