---
type: process
status: stub
consumes: []
produces: []
---

# launch-web-cli

The alternate, non-Electron way to run this app — not currently deployed anywhere observed, but part of the shipped packages.

## Input → Movement → Output

Input: running the `aionui-web` binary (`packages/web-cli/bin/aionui-web.js`). Movement: `packages/web-cli/src/index.ts` imports `startWebHost`/`startStaticServer` from `@aionui/web-host` directly — same underlying functions `launch-desktop` uses, no Electron/Chromium involved. Output: a running backend + static server, with `ensureAdminPassword` and optional auto-open-browser handling.

## Why this shape

Unverified past the imports — this card exists to record that this path exists and shares `web-host` with desktop, not to claim full understanding of its startup sequence.

## Steps

Unverified — read `packages/web-cli/src/index.ts` in full before treating this as more than a stub.

## If you change this

- **Hits:** unverified
- **Does not hit:** `launch-desktop` directly, but changes to `web-host` (the shared library) hit both

## Surfaces

| Surface | Role |
|---|---|
| unverified | — |

## See

- Source: `packages/web-cli/src/index.ts`, `packages/web-cli/bin/aionui-web.js`
