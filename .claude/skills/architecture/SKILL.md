---
name: architecture
description: |
  Project architecture and file structure conventions for all process types.
  Use when: (1) Creating new files or modules, (2) Deciding where code should go,
  (3) Converting single-file components to directories, (4) Reviewing code for structure compliance,
  (5) Adding new bridges, services, or startup modules.
---

# Architecture Skill

Determine correct file placement and structure for an Electron multi-process project.

## Detailed References

- **Renderer layer** (components, hooks, utils, pages, CSS): [references/renderer.md](references/renderer.md)
- **Main process & shared layer** (bridges, services, preload): [references/process.md](references/process.md)
- **Project root & monorepo layout**: [references/project-layout.md](references/project-layout.md)

Startup object/process map: [map/AGENTS.md](../../../map/AGENTS.md). `aioncore` is an external binary, not a directory in this repo.

---

## Decision Tree — Where Does New Code Go?

```
Is it UI (React components, hooks, pages)?
  └── YES → packages/desktop/src/renderer/              → see references/renderer.md

Is it an IPC handler responding to renderer calls?
  └── YES → packages/desktop/src/process/bridge/        → see references/process.md

Is it business logic running in the main process?
  └── YES → packages/desktop/src/process/services/      → see references/process.md

Is it app boot, single-instance, or quit cleanup?
  └── YES → packages/desktop/src/process/startup/

Is it a main-process utility (CDP, tray, storage, window)?
  └── YES → packages/desktop/src/process/utils/

Is it the desktop pet window?
  └── YES → packages/desktop/src/process/pet/

Is it used by BOTH main and renderer processes?
  └── YES → packages/desktop/src/common/

Is it the WebUI static server or the aioncore launcher?
  └── YES → packages/web-host/src/
```

Do not create `packages/desktop/src/process/agent`, `worker`, `channels`, `extensions`, or `webserver`. Those directories are not in the tree. Agent runtime lives in the external `aioncore` binary.

---

## Process Boundary Rules

**Hard rules — violating them causes runtime crashes.**

| Process                                         | Can use                                                    | Cannot use                                      |
| ----------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| **Main** (`packages/desktop/src/process/`)      | Node.js, Electron main APIs, `fs`, `path`, `child_process` | DOM APIs (`document`, `window`, React)          |
| **Renderer** (`packages/desktop/src/renderer/`) | DOM APIs, React, browser APIs                              | Node.js APIs (`fs`, `path`), Electron main APIs |
| **Preload** (`packages/desktop/src/preload/`)   | `contextBridge`, `ipcRenderer`                             | DOM manipulation, Node.js `fs`                  |

Cross-process communication: main ↔ renderer IPC via `packages/desktop/src/preload/` (`main.ts`, plus the pet preloads) and `packages/desktop/src/process/bridge/`.

```typescript
// NEVER in renderer
import { something } from '@process/services/foo'; // crashes at runtime

// Use IPC instead
const result = await window.api.someMethod(); // goes through preload
```

---

## Naming Conventions

### Directories

| Scope                              | Convention | Reason                                         |
| ---------------------------------- | ---------- | ---------------------------------------------- |
| **Renderer** component/module dirs | PascalCase | React convention — dir name = component name   |
| **Everything else**                | lowercase  | Node.js convention                             |
| **Categorical dirs** (everywhere)  | lowercase  | `components/`, `hooks/`, `utils/`, `services/` |
| **Platform dirs** (everywhere)     | lowercase  | `platforms/acp/`, `platforms/gemini/`          |

> Quick test: "Inside `packages/desktop/src/renderer/` AND represents a specific component/feature (not a category)?" → PascalCase. Otherwise → lowercase.

### Files

| Content                   | Convention                      | Examples                              |
| ------------------------- | ------------------------------- | ------------------------------------- |
| React components, classes | PascalCase                      | `SettingsModal.tsx`, `CronService.ts` |
| Hooks                     | camelCase with `use` prefix     | `useTheme.ts`, `useCronJobs.ts`       |
| Utilities, helpers        | camelCase                       | `formatDate.ts`, `cronUtils.ts`       |
| Entry points              | `index.ts` / `index.tsx`        | Required for directory-based modules  |
| Config, types, constants  | camelCase                       | `types.ts`, `constants.ts`            |
| Styles                    | kebab-case or `Name.module.css` | `chat-layout.css`                     |

---

## Structural Rules

1. **Directory size limit**: Max **10** direct children. Split into subdirectories by responsibility when approaching.
2. **No single-file directories**: Merge into parent or related directory.
3. **Single file vs directory**: If a component needs a private sub-component or hook, convert to a directory with `index.tsx`.
4. **Page-private first**: Start code in `pages/<PageName>/`. Promote to shared only when a second consumer appears.

## Test File Mapping

Tests live under `tests/unit/` and `tests/integration/`. Playwright e2e is `tests/e2e/` (`bun run test:e2e`), not `bun run test`.

| Source                                                                       | Test                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------ |
| `packages/desktop/src/process/bridge/feedbackBridge.ts`                      | `tests/unit/feedback/feedbackBridge.test.ts`     |
| `packages/desktop/src/renderer/pages/conversation/Messages/useAutoScroll.ts` | `tests/unit/renderer/useAutoScroll.dom.test.tsx` |

When `tests/unit/` exceeds 10 direct children, group into subdirectories matching source structure.

---

## Quick Checklist

- [ ] Code is in the correct process directory (no cross-process imports)
- [ ] Renderer code does not use Node.js APIs
- [ ] Main process code does not use DOM APIs
- [ ] New IPC channels are bridged through `packages/desktop/src/preload/`
- [ ] Renderer component/module dirs use PascalCase; categorical dirs use lowercase
- [ ] Platform dirs use lowercase everywhere
- [ ] Directory-based modules have `index.tsx` / `index.ts` entry point
- [ ] Page-private code is under `pages/<PageName>/`, not in shared dirs
- [ ] No single-file directories
- [ ] No directory exceeds 10 direct children
- [ ] New source files are auto-included in coverage — verify they are not accidentally excluded in `vitest.config.ts` → `coverage.exclude`
- [ ] New services separate pure logic from IO
