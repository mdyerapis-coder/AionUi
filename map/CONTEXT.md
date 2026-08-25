# How to walk this map

## Universes

All catalogued nouns are **live**. This is a fork of a large, actively-maintained upstream OSS project — most of the tree (UI components, mobile app, extension examples) is out of scope for this map, not "ghost."

## The aioncore boundary — read this before touching backend startup

`aioncore` is **not source in this repo**. It's a prebuilt binary at `resources/bundled-aioncore/<platform-arch>/aioncore`, prepared by `packages/shared-scripts/src/prepare-aioncore.js` and spawned as a child process by `packages/web-host/src/backend-launcher.ts`. If you're debugging "the backend," you're debugging the *launcher* in this repo — the backend's own behavior comes from a separate project entirely. Don't go looking for aioncore's implementation here.

## Two ways this app runs headless

1. **`AionUi --webui`** — the Electron binary itself, in a mode that skips opening a window (`packages/desktop/src/index.ts:182`, `isWebUIMode = hasSwitch('webui')`). Still requires a display (hence `xvfb-run` when deployed on a server). **This is what `aionui.service` on masons-ground runs.**
2. **`aionui-web`** — a separate standalone binary (`packages/web-cli`) that composes `@aionui/web-host` directly, no Electron/Chromium at all. Not currently deployed anywhere observed.

Both call into the same `packages/web-host` library for backend spawning and static serving — that's the actual shared core, not either entry point.

## Name collisions

None identified.
