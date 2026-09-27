# AionUi Docs

Documentation is organized by reader intent, not by document type.

| Directory                       | For whom          | What lives here                                                                                 |
| ------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| [`guides/`](guides)             | Users & operators | How to deploy, test, and run the product. Server deployment, WebUI, Hub testing, CDP debugging. |
| [`contributing/`](contributing) | Contributors      | Dev environment setup and file-structure conventions.                                           |
| [`prds/`](prds)                 | Product team      | Formal Product Requirement Documents. **Do not reorganize without their consent.**              |
| [`readme/`](readme)             | Global users      | Translated copies of the root `readme.md`.                                                      |
| [`theming/`](theming)           | Engineers         | Theme tokens.                                                                                   |
| [`../map/`](../map/AGENTS.md)   | Engineers         | Startup object/process map. There is no `docs/architecture/` or `docs/specs/`.                  |

## Quick pointers

- New to the project? Start with [`map/AGENTS.md`](../map/AGENTS.md).
- Setting up a dev environment? See [`contributing/development.md`](contributing/development.md).
- Writing code? The entry point for code-style, linting, formatting, and commit rules is [`AGENTS.md`](../AGENTS.md) at the repo root.
- Deploying a server? [`guides/deploy-server.md`](guides/deploy-server.md).

## Where to put new docs

| Content type                                      | Destination                  |
| ------------------------------------------------- | ---------------------------- |
| User/ops-facing how-to                            | `guides/`                    |
| Contributor convention, workflow, or tooling rule | `contributing/`              |
| Startup object or process card                    | `map/` (see `map/AGENTS.md`) |
| Formal PRD owned by product team                  | `prds/` (coordinate first)   |
| README translation                                | `readme/readme_<locale>.md`  |
