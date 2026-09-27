# CI

Workflows are `.github/workflows/*.yml`. Triggers that are easy to misread:

- `pr-checks.yml` — pull requests to `main` and `dev` (markdown/docs paths are ignored). Code quality is `prek`; unit tests, coverage, and build smoke are separate jobs.
- `pr-checks-docs.yml` — pull requests that only touch markdown, `docs/`, `.vscode/`, or issue templates.
- `build-and-release.yml` — push to `dev`, and any tag. The quality job runs `bun run lint`, `bun run format:check`, `bunx tsc --noEmit`, and `bunx vitest run`. Packaging runs only when `vars.PUBLISH_RELEASE == 'true'`.
- `release-distribute.yml` — `release: published`, plus `workflow_dispatch`.
- `build-manual.yml` — `workflow_dispatch`. `pack-web-cli.yml` — `workflow_call` or `workflow_dispatch`.

Signing inputs read by `_build-reusable.yml` include `APPLE_ID`, `APPLE_ID_PASSWORD`, and `GH_TOKEN`. There is no `scripts/release.sh` and no `bump-homebrew.yml`.
