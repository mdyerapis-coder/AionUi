# Main Process & Shared Layer

## `packages/desktop/src/process/` Structure

```
packages/desktop/src/process/
├── backend/       # Resolve the external aioncore binary
├── bridge/        # IPC handlers — one file per domain
├── feedback/
├── pet/           # Desktop pet window
├── resources/     # Builtin MCP launchers (builtinMcp/)
├── services/      # Business logic: database/, i18n/, skills/, updates
├── startup/       # Boot, single-instance, quit cleanup
└── utils/         # Main-process-only utilities (CDP, tray, storage, window)
```

`aioncore` is not source here. The launcher lives in `packages/web-host/src/backend-launcher.ts`. WebUI static serving is `packages/web-host/src/static-server.ts`.

There is no `process/agent`, `process/worker`, `process/channels`, `process/extensions`, `process/webserver`, or `WorkerProtocol.ts`.

## Naming Conventions

| Type    | Pattern                         | Examples                           |
| ------- | ------------------------------- | ---------------------------------- |
| Bridge  | `<domain>Bridge.ts` (camelCase) | `webuiBridge.ts`, `themeBridge.ts` |
| Service | `<Name>Service.ts` (PascalCase) | `autoUpdaterService.ts`            |

Directories stay lowercase.

## Adding a New IPC Bridge

1. Create `packages/desktop/src/process/bridge/<domain>Bridge.ts`
2. Register in `packages/desktop/src/process/bridge/index.ts`
3. Expose the channel from `packages/desktop/src/preload/` (`main.ts`, or a pet preload)
4. Add renderer-side types if needed

## Adding a New Service

- Simple → single file in `packages/desktop/src/process/services/`
- Complex (multiple files) → subdirectory: `packages/desktop/src/process/services/<name>/`

## Service Testability Rules

### Pure Logic vs IO Separation

- **Pure logic** (transformation, validation, formatting) → standalone functions, no `fs`/`db`/`net`
- **IO operations** (file read, DB query, HTTP call) → thin wrappers in the service or repository
- Service methods should receive IO results as parameters

### Dependency Injection

```typescript
// Hard to test
import { db } from '@process/services/database';
function getConversation(id: string) {
  return db.query('SELECT * FROM conversations WHERE id = ?', id);
}

// Easy to test
function getConversation(repo: IConversationRepository, id: string) {
  return repo.findById(id);
}
```

For existing code using direct imports, `vi.mock()` is acceptable. For new code, prefer parameter injection.

---

## Shared Layer

### Preload (`packages/desktop/src/preload/`)

IPC bridge between main and renderer. Uses `contextBridge` to expose safe APIs.

- Entry files: `main.ts`, `petPreload.ts`, `petConfirmPreload.ts`, `petHitPreload.ts`. There is no `preload.ts`.
- Only `contextBridge` and `ipcRenderer` APIs allowed
- No DOM manipulation, no Node.js `fs`

### Common (`packages/desktop/src/common/`)

Code imported by **both** main and renderer processes.

- **Belongs**: shared types, API adapters, protocol converters, storage keys
- **Does NOT belong**: React components → `renderer/`, Node.js-specific → `process/`

### Web host (`packages/web-host/src/`)

`startWebHost` composes the aioncore launcher and the static server. See `packages/web-host/README.md`.
