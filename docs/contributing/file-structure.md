# File & Directory Structure

Where new source files go is the architecture skill: [`.claude/skills/architecture/SKILL.md`](../../.claude/skills/architecture/SKILL.md). This page is only repo-root placement.

## Repository root

- README translations belong in `docs/readme/`. Only `readme.md` stays at the root.
- User and operator guides belong in `docs/guides/`.
- Contributor docs belong in `docs/contributing/`.
- Product PRDs belong in `docs/prds/`.
- The startup map is [`map/`](../../map/AGENTS.md). There is no `docs/architecture/` or `docs/specs/`.
- Tooling config (`package.json`, `tsconfig.json`, `vitest.config.ts`, `uno.config.ts`) stays at the root.
- Desktop runtime code goes under `packages/desktop/`, not the repository root.

## CSS

Global Arco theme overrides go in `packages/desktop/src/renderer/styles/arco-override.css`. Component-scoped Arco overrides use a CSS Module with `:global()`. Token list: [`docs/theming/tokens.md`](../theming/tokens.md).
