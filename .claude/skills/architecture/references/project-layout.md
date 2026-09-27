# Project Layout

## Root Directory

### Rules

- **Workspace root stays minimal**: root keeps shared config, scripts, tests, docs, assets, and package manager files.
- **Desktop app source lives under `packages/desktop/`**: do not add new app runtime code back to the root.
- **README translations** → `docs/readme/`, not root. Only main `readme.md` stays at root.
- **Guide documents** → `docs/guides/` and `docs/contributing/`
- **Startup map** → `map/` (there is no `docs/architecture/` or `docs/specs/`)
- **Build artifacts** (`out/`, `node_modules/`) are gitignored

### Current Root Structure

```
project-root/
├── packages/               # desktop, web-host, web-cli, shared-scripts
├── tests/                  # unit, integration, e2e
├── docs/
├── map/                    # object/process map
├── scripts/
├── resources/
├── public/
├── patches/
├── homebrew/
├── mobile/
├── examples/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── AGENTS.md
└── CLAUDE.md               # @AGENTS.md
```

> **Migration rule**: New desktop runtime modules go under `packages/desktop/`, not the repository root.

---

## `packages/desktop/` Layout

```
packages/desktop/
├── src/
│   ├── renderer/          # React UI, no Node.js APIs
│   ├── process/           # Electron main process — see references/process.md
│   ├── common/            # Shared cross-process code
│   ├── preload/           # IPC preload scripts
│   ├── index.ts           # Main process entry
│   ├── sentry.ts
│   └── types.d.ts
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

### Placement Rules

- New Electron runtime code belongs in `packages/desktop/src/**`.
- Root-level scripts and config may reference `packages/desktop/**`, but should not duplicate app source.
- Tests remain under `tests/**` and should reference desktop source through aliases or `packages/desktop/...` paths.
