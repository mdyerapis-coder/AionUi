# Build scripts

`bun run dist` and `dist:*` run `scripts/build-with-builder.js`. That script bundles with electron-vite and packages with electron-builder (`packages/desktop/electron-builder.yml`).

Hooks in that yml:

- `afterPack` → `scripts/afterPack.js` (native rebuild via `scripts/rebuildNativeModules.js`, currently `better-sqlite3`, plus bundled aioncore checks)
- `afterSign` → `scripts/afterSign.js` (macOS notarization)

There is no Electron Forge config and no `beforeBuild.js`.
