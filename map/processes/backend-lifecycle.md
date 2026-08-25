---
type: process
status: verified
consumes: []
produces: []
---

# backend-lifecycle

Spawn the `aioncore` binary, track it, tear it down cleanly.

## Input → Movement → Output

Input: a start request from either entry point (desktop or web-cli). Movement: `buildSpawnArgs`/`buildSpawnEnv` construct the child process invocation, `findAvailablePort` resolves a port if needed, `BackendLifecycleManager` spawns and supervises the `aioncore` binary at `resources/bundled-aioncore/<plat-arch>/aioncore`. Output: a running aioncore process the caller can query (via whatever port it bound) and later stop.

## Why this shape

Two distinct failure modes get distinct exception types (`BackendStartupError` vs `BackendStartupCancelledError`) — a caller can tell "it crashed" from "we stopped waiting" and react differently (surface an error vs. just exit quietly).

## Steps

1. Caller builds spawn config, calls into `BackendLifecycleManager` (`backend-launcher.ts:508`).
2. `buildSpawnArgs`/`buildSpawnEnv` construct argv/env (`:196,224`).
3. `findAvailablePort` resolves a port (`:267`) when the caller doesn't pin one.
4. Process spawned; lifecycle manager supervises until stop is requested or it exits unexpectedly.
5. Unverified: whether a successful spawn also writes to `agent-process-registry.json` — read both files together before relying on this.

## If you change this

- **Hits:** both `launch-desktop` and `launch-web-cli` — this is the one shared spawn path
- **Does not hit:** aioncore's own internal behavior once running — that's a separate binary/project

## Surfaces

| Surface | Role |
|---|---|
| desktop, web-cli | both call in |

## See

- Objects: [../objects/web-host/backend-launcher.md](../objects/web-host/backend-launcher.md)
- Source: `packages/web-host/src/backend-launcher.ts`
